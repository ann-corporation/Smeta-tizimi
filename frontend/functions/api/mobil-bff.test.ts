// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { base64url, deviceHash, ANDROID_ORIGIN, DESKTOP_ORIGIN } from '../_shared/desktop-device';
import { sessiyaOl } from '../_shared/auth';
import { vakolatKeshTozala } from '../_shared/role-authority';
import { otaKeshTozala } from '../_shared/ota-kesh';
import { onRequestPost as gateway } from './mobil/bff';

const env = { SUPABASE_URL: 'https://synthetic.supabase.co', SUPABASE_KEY: 'synthetic-only', SESSIYA_KALIT: 'synthetic-only'.repeat(3),
  GAS_URL: 'https://synthetic.invalid', GAS_TOKEN: 'synthetic' };
const deviceId = '00000000-0000-4000-8000-000000000001';
const token = base64url(new Uint8Array(32).fill(33));
let expires = 0;
let calls: { path: string; body: any }[] = [];
beforeEach(() => {
  expires = Date.now() + 7 * 86400_000; calls = [];
  vakolatKeshTozala(); otaKeshTozala();
  vi.stubGlobal('fetch', vi.fn(async (raw: string, init?: RequestInit) => {
    const u = new URL(String(raw));
    const b = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push({ path: u.pathname, body: b });
    if (u.pathname.endsWith('/t2_ish_joylarim_v1')) return Response.json({ ok: true, ish_joylari: [], ishlar: [] });
    if (u.pathname.endsWith('/t2_desktop_qurilma_tekshir_v2')) return Response.json(b.p_token_hash === await deviceHash(token) ?
      { ok: true, device_id: deviceId, foydalanuvchi_id: 7, tugaydi: expires, sessiya_exp: expires, versiya: 1 } : { ok: false });
    if (u.pathname.endsWith('/t2_men_v1')) return Response.json({ ok: true, platform_role: 'none', foydalanuvchi: { holat: 'faol' },
      context_kompaniyalar: [{ kompaniya_id: 8, effective_role: 'pto', permissions: ['company.read'] }] });
    throw new Error('Unexpected synthetic upstream: ' + u.pathname);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vakolatKeshTozala(); otaKeshTozala(); });
function native(body: unknown, origin = ANDROID_ORIGIN, bearer = token) {
  return new Request('https://site.test/api/mobil/bff', { method: 'POST', headers: { Authorization: 'Bearer ' + bearer, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
const ctx = (request: Request) => ({ request, env, data: {}, next: vi.fn() } as never);
const bff = (path: string, method = 'GET', body?: unknown) => gateway(ctx(native({ path, method, ...(body == null ? {} : { body }) })));

describe('mobil BFF (Android native)', () => {
  it('rejects an unknown device token with 401', async () => {
    const bad = base64url(new Uint8Array(32).fill(9));
    const res = await gateway(ctx(native({ path: '/api/sessiya', method: 'GET' }, ANDROID_ORIGIN, bad)));
    expect(res.status).toBe(401);
  });
  it.each(['https://smeta-tizimi.pages.dev', 'app://qurai-android.evil', 'null', ''])('rejects wrong origin %s', async origin => {
    expect(await sessiyaOl(native({}, origin), env)).toBeNull();
    expect((await gateway(ctx(native({ path: '/api/sessiya', method: 'GET' }, origin)))).status).toBe(401);
  });
  it('accepts the Android origin only with a verified bearer; desktop origin keeps working', async () => {
    expect(await sessiyaOl(native({}, ANDROID_ORIGIN), env)).toMatchObject({ foydalanuvchi_id: 7 });
    expect(await sessiyaOl(native({}, DESKTOP_ORIGIN), env)).toMatchObject({ foydalanuvchi_id: 7 });
    const cookieOnly = new Request('https://site.test/api/sessiya', { headers: { Origin: ANDROID_ORIGIN } });
    expect(await sessiyaOl(cookieOnly, env)).toBeNull();
  });
  it.each([
    { path: 'https://evil.test/api/sessiya', method: 'GET' }, { path: '/api/kirish', method: 'POST' },
    { path: '/api/gas', method: 'POST' }, { path: '/api/desktop/lease', method: 'POST' },
    { path: '/api/sessiya', method: 'DELETE' }, { path: '/api/sessiya', method: 'POST' },
    { path: '/api/sessiya', method: 'GET', headers: { Cookie: 'forged' } }, { path: '/api/ai-savol', method: 'GET' },
  ])('refuses non-allowlisted target %j', async body => {
    expect((await gateway(ctx(native(body)))).status).toBe(400);
  });
  it('happy path: /sessiya passes through with live authority, no cookie leak; role never from token', async () => {
    const r = await bff('/api/sessiya');
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ foydalanuvchi_id: 7, rol: 'pto', tugaydi: expires });
    expect(r.headers.get('Set-Cookie')).toBeNull();
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(calls.some(c => c.path.endsWith('/t2_men_v1'))).toBe(true);
  });
  it('workplace read with any section is dispatched with the device actor', async () => {
    const res = await bff('/api/ish-joyi?bolim=joylarim');
    expect(res.status).toBe(200);
    expect(calls.find(c => c.path.endsWith('/t2_ish_joylarim_v1'))?.body).toEqual({ p_actor_id: 7 });
  });
  it('dispatches approval decisions (hujjat-aylanish POST) and photo linking (foto-dalil POST) as the device actor', async () => {
    const r = await bff('/api/hujjat-aylanish', 'POST', { amal: 'zanjir_qaror', kompaniya_id: 8, zanjir_id: 3, qaror: 'tasdiqlash' });
    expect(r.status).not.toBe(400);
    const f = await bff('/api/foto-dalil', 'POST', { amal: 'ochir', id: 1 });
    expect(f.status).not.toBe(400);
  });
  it('allows invite-code join (ish-joyi POST) and module picks (modullarim) as the device actor, never a client actor', async () => {
    const j = await bff('/api/ish-joyi', 'POST', { amal: 'qoshil', kod: 'ABCD' });
    const notTarget = async (r: Response) => expect(((await r.json().catch(() => ({}))) as { code?: string }).code).not.toBe('TARGET_INVALID');
    await notTarget(j);
    await notTarget(await bff('/api/modullarim?kompaniya_id=8'));
    const m = await bff('/api/modullarim', 'POST', { kompaniya_id: 8, tanlangan: [], tartib: [], expected_version: 0 });
    await notTarget(m);
    expect((await bff('/api/kirish-taklif', 'POST', {})).status).toBe(400);
  });
  it('bounds body size to 2 MB', async () => {
    expect((await gateway(ctx(native({ path: '/api/sb', method: 'POST', body: 'a'.repeat(2 * 1024 * 1024) })))).status).toBe(413);
  });
  it('refuses a GET with body and a malformed envelope', async () => {
    expect((await gateway(ctx(native({ path: '/api/sessiya', method: 'GET', body: {} })))).status).toBe(400);
    expect((await gateway(ctx(native({ path: '/api/sessiya', method: 'GET', extra: 1 })))).status).toBe(400);
  });
});

describe('mobil BFF: warehouse (Ombor) paths reach the unchanged sb / sb-yoz handlers', () => {
  const kompaniya_id = 8;
  const opId = '3f2b8c1e-5a4d-4e6f-9a7b-1c2d3e4f5a6b';
  // Re-stub fetch so the synthetic upstream also answers the warehouse RPCs; everything else keeps the shared behaviour.
  const stubWarehouse = () => {
    const base = globalThis.fetch as unknown as (raw: string, init?: RequestInit) => Promise<Response>;
    vi.stubGlobal('fetch', vi.fn(async (raw: string, init?: RequestInit) => {
      const u = new URL(String(raw));
      if (/\/(t2_sklad_markaziy_qoldiq_v1|t2_sklad_markaziy_berdim_v1|t2_skladga_yozish)$/.test(u.pathname)) {
        calls.push({ path: u.pathname, body: init?.body ? JSON.parse(String(init.body)) : {} });
        return Response.json({ ok: true, qatorlar: [], takror: false });
      }
      return base(raw, init);
    }));
  };
  it('the allowlist accepts the warehouse read and write targets (no new path is needed)', async () => {
    stubWarehouse();
    for (const [path, body] of [
      ['/api/sb', { soro: 'sklad_markaziy_qoldiq_v1', kompaniya_id, sklad_id: 7, qidir: '', limit: 200 }],
      ['/api/sb-yoz', { amal: 'sklad_berdim_v1', kompaniya_id, sklad_id: 7, obyekt_id: 101, nomi: 'S', birligi: 'qop', miqdor: '12.5', sana: '2026-11-15', operation_id: opId }],
      ['/api/sb-yoz', { amal: 'skladga_yozish', kompaniya_id, operatsiya: 'prixod', obyekt_id: 101, turi: 'mat', sana: '2026-11-15', nomi: 'S', birligi: 'qop', obyomi: 12.5, operation_id: opId }],
    ] as const) {
      const res = await bff(path, 'POST', body);
      expect(res.status, path + ' ' + body[('amal' in body ? 'amal' : 'soro') as never]).not.toBe(400);   // 400 = TARGET_INVALID from the gateway
    }
  });
  it('refuses a warehouse call on a path outside the allowlist', async () => {
    expect((await gateway(ctx(native({ path: '/api/sklad', method: 'POST', body: {} })))).status).toBe(400);
  });
});

describe('mobil BFF: @username (profil) and Jarvis (ai-savol)', () => {
  const notTarget = async (r: Response) => expect(((await r.json().catch(() => ({}))) as { code?: string }).code).not.toBe('TARGET_INVALID');
  it.each(['username_ol', 'username_tekshir', 'username_belgila', 'username_sozlama', 'qidir', 'kompaniyadosh_qidir', 'username_ommaviy', 'taklif_royxat', 'taklif_javob'])
    ('allows the profil action %s', async amal => { await notTarget(await bff('/api/profil', 'POST', { amal })); });
  it.each(['parol', 'google_ulash', 'google_uzish', 'hisob_birlashtir', 'boshqa_sessiyalar_chiqish', 'usul_uz', 'birlashtir_email_kod', 'yangila', '', undefined])
    ('refuses the account-security / unknown profil action %s', async amal => {
      expect((await bff('/api/profil', 'POST', { amal })).status).toBe(400);
    });
  it('refuses GET /api/profil and a profil POST without a body', async () => {
    expect((await bff('/api/profil')).status).toBe(400);
    expect((await bff('/api/profil', 'POST')).status).toBe(400);
  });
  it('kirish-taklif: only the director-side yarat action is reachable (qabul/ulash/royxat/bekor are refused)', async () => {
    await notTarget(await bff('/api/kirish-taklif', 'POST', { amal: 'yarat', kompaniya_id: 8, ism: 'Test', telefon: '+998900000000', rol: 'pto' }));
    for (const amal of ['qabul', 'ulash', 'royxat', 'bekor']) expect((await bff('/api/kirish-taklif', 'POST', { amal })).status).toBe(400);
    expect((await bff('/api/kirish-taklif')).status).toBe(400);
  });
  it('dispatches a Jarvis question to ai-savol (POST only) as the device actor', async () => {
    await notTarget(await bff('/api/ai-savol', 'POST', { savol: 'salom' }));
    expect((await bff('/api/ai-savol', 'GET')).status).toBe(400);
  });
});