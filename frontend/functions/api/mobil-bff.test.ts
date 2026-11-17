// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { base64url, deviceHash, ANDROID_ORIGIN, DESKTOP_ORIGIN } from '../_shared/desktop-device';
import { sessiyaOl } from '../_shared/auth';
import { vakolatKeshTozala } from '../_shared/role-authority';
import { otaKeshTozala } from '../_shared/ota-kesh';
import { onRequestPost as gateway, MOBIL_PATH } from './mobil/bff';

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
  it.each(['username_ol', 'username_tekshir', 'username_belgila', 'username_sozlama', 'qidir', 'kompaniyadosh_qidir', 'username_ommaviy', 'taklif_royxat', 'taklif_javob', 'yangila'])
    ('allows the profil action %s', async amal => { await notTarget(await bff('/api/profil', 'POST', { amal })); });
  it.each(['parol', 'google_ulash', 'google_uzish', 'hisob_birlashtir', 'usul_uz', 'birlashtir_email_kod', 'usullar', '', undefined])
    ('refuses the account-security / unknown profil action %s', async amal => {
      expect((await bff('/api/profil', 'POST', { amal })).status).toBe(400);
    });
  it('allows the read-only GET /api/profil, refuses a profil POST without a body', async () => {
    await notTarget(await bff('/api/profil'));
    expect((await bff('/api/profil', 'POST')).status).toBe(400);
  });
});

describe('mobil BFF: P10 profile, sessions, texnadzor, notification preferences', () => {
  const notTarget = async (r: Response) => expect(((await r.json().catch(() => ({}))) as { code?: string }).code).not.toBe('TARGET_INVALID');
  it('boshqa_sessiyalar_chiqish re-enrols THIS device and returns the new token (Set-Cookie never leaks)', async () => {
    const base = globalThis.fetch as unknown as (raw: string, init?: RequestInit) => Promise<Response>;
    const seen: { path: string; body: any }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (raw: string, init?: RequestInit) => {
      const u = new URL(String(raw)); const b = init?.body ? JSON.parse(String(init.body)) : {};
      if (u.pathname.endsWith('/t2_sessiya_bekor_v1')) return Response.json({ ok: true, sessiya_bekor_dan: new Date().toISOString() });
      if (u.pathname.endsWith('/t2_desktop_qurilma_yarat_v2')) { seen.push({ path: u.pathname, body: b }); return Response.json({ ok: true, device_id: b.p_device_id, tugaydi: b.p_sessiya_exp }); }
      if (u.pathname.endsWith('/t2_desktop_qurilma_bekor_v1')) { seen.push({ path: u.pathname, body: b }); return Response.json({ ok: true }); }
      return base(raw, init);
    }));
    const r = await bff('/api/profil', 'POST', { amal: 'boshqa_sessiyalar_chiqish', qurilma_nomi: 'Pixel', os: 'Android 14', ilova_versiya: '0.1.10' });
    expect(r.status).toBe(200);
    expect(r.headers.get('Set-Cookie')).toBeNull();
    const j = await r.json() as { ok: boolean; qurilma: { device_id: string; token: string; tugaydi: number } | null };
    expect(j.ok).toBe(true);
    expect(j.qurilma?.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(j.qurilma?.device_id).not.toBe(deviceId);
    const created = seen.find(s => s.path.endsWith('/t2_desktop_qurilma_yarat_v2'))!.body;
    expect(created).toMatchObject({ p_actor_id: 7, p_qurilma_nomi: 'Pixel', p_os: 'Android 14', p_ilova_versiya: '0.1.10' });
    expect(created.p_token_hash).toBe(await deviceHash(j.qurilma!.token));
    expect(seen.find(s => s.path.endsWith('/t2_desktop_qurilma_bekor_v1'))!.body).toMatchObject({ p_actor_id: 7, p_device_id: deviceId });
  });
  it('texnadzor reads: only the nazorat sections are reachable', async () => {
    for (const bolim of ['nazorat_uy', 'taqdimlar', 'nazorat_holat', 'f2_tekshiruv']) await notTarget(await bff(`/api/tomon?bolim=${bolim}&kompaniya_id=8`));
    for (const bolim of ['grant_saqla', 'qidir', 'tolovlar', 'sub_akt', '']) expect((await bff(`/api/tomon?bolim=${bolim}&kompaniya_id=8`)).status).toBe(400);
    expect((await bff('/api/tomon?kompaniya_id=8')).status).toBe(400);
  });
  it('texnadzor decisions: nazorat_qaror (+ remark) allowed; grants, payments, invites refused', async () => {
    await notTarget(await bff('/api/tomon', 'POST', { amal: 'nazorat_qaror', kompaniya_id: 8, taqdim_id: 3, qaror: 'rad', izoh: 'Armatura qadami noto\'g\'ri' }));
    for (const amal of ['taklif', 'kod_qabul', 'grant_saqla', 'tolov_qaror', 'taqdim_yarat', 'vakolat_ber', 'qaror', 'ichki_qaror', '']) expect((await bff('/api/tomon', 'POST', { amal })).status).toBe(400);
  });
  it('notification preferences: telegram status read + sozlama only', async () => {
    await notTarget(await bff('/api/telegram'));
    await notTarget(await bff('/api/telegram', 'POST', { amal: 'sozlama', bildirishnoma: { topshiriq: true } }));
    for (const amal of ['kod', 'uz', 'admin_holat', 'admin_ornat', '']) expect((await bff('/api/telegram', 'POST', { amal })).status).toBe(400);
  });
  it('MOBIL_PATH covers exactly the new paths', () => {
    expect(MOBIL_PATH.test('/api/tomon?bolim=nazorat_uy&kompaniya_id=8')).toBe(true);
    expect(MOBIL_PATH.test('/api/telegram')).toBe(true);
    expect(MOBIL_PATH.test('/api/telegram/webhook')).toBe(false);
    expect(MOBIL_PATH.test('/api/tomon-x')).toBe(false);
  });
});

describe('mobil BFF: ombor-buyruq (omborchi matn/ovoz buyrug\'i)', () => {
  // Regressiya: relizda /api/ombor-buyruq BFF ro'yxatida yo'q edi — Android'da matn ham, ovoz ham TARGET_INVALID bilan rad etilardi.
  let rpcs: { nom: string; body: Record<string, unknown> }[];
  beforeEach(() => {
    rpcs = [];
    const base = globalThis.fetch as typeof fetch;
    vi.stubGlobal('fetch', vi.fn(async (raw: string, init?: RequestInit) => {
      const u = new URL(String(raw));
      if (u.pathname.endsWith('/t2_men_v1')) return Response.json({ ok: true, platform_role: 'none', foydalanuvchi: { holat: 'faol' },
        context_kompaniyalar: [{ kompaniya_id: 8, effective_role: 'omborchi', permissions: ['warehouse.read', 'warehouse.write'] }] });
      const nom = /\/rpc\/([a-z0-9_]+)/.exec(u.pathname)?.[1];
      if (nom && nom.startsWith('t2_ombor_')) {
        rpcs.push({ nom, body: JSON.parse(String(init?.body ?? '{}')) });
        return Response.json(nom === 't2_ombor_qoldiq_v2' ? { ok: true, jami: 0, limit: 6, offset: 0, turlar: [], qatorlar: [] } : { ok: true, takror: false, harakat_id: 41 });
      }
      if (nom === 't2_audit_yoz') return Response.json(null);
      return base(raw, init);
    }));
  });
  it('MOBIL_PATH ombor-buyruq ni o\'tkazadi, qo\'shnilarini emas', () => {
    expect(MOBIL_PATH.test('/api/ombor-buyruq')).toBe(true);
    expect(MOBIL_PATH.test('/api/ombor-ovoz')).toBe(false);
    expect(MOBIL_PATH.test('/api/ombor-buyruq-x')).toBe(false);
  });
  it('matn: tahlil → preview + token → tasdiq → RPC (aktor sessiyadan, qurilma tokenidan)', async () => {
    const t1 = await bff('/api/ombor-buyruq', 'POST', { amal: 'tahlil', kompaniya_id: 8, sklad_id: 3, til: 'uz', matn: '50 kg mix keldi' });
    expect(t1.status).toBe(200);
    const j = await t1.json() as { ok: boolean; holat: string; token: string; preview: Record<string, unknown> };
    expect(j).toMatchObject({ ok: true, holat: 'tasdiq_kerak' });
    expect(j.preview).toMatchObject({ tur: 'prixod', miqdor: 50 });
    expect(rpcs.some(r => r.nom === 't2_ombor_prixod_v1')).toBe(false); // preview hech narsa yozmaydi
    const t2 = await bff('/api/ombor-buyruq', 'POST', { amal: 'tasdiq', kompaniya_id: 8, sklad_id: 3, token: j.token });
    expect(t2.status).toBe(200);
    const yoz = rpcs.find(r => r.nom === 't2_ombor_prixod_v1')!;
    expect(yoz.body).toMatchObject({ p_actor_id: 7, p_kompaniya_id: 8, p_sklad_id: 3, p_miqdor: '50' });
  });
  it('eslatma (autocomplete) va ostatka o\'qish BFF orqali ishlaydi', async () => {
    expect((await bff('/api/ombor-buyruq', 'POST', { amal: 'eslatma', kompaniya_id: 8, sklad_id: 3, q: 'sem' })).status).not.toBe(400);
    const q = await bff('/api/ombor-buyruq', 'POST', { amal: 'qoldiq', kompaniya_id: 8, sklad_id: 3 });
    expect(q.status).toBe(200);
    expect(rpcs.find(r => r.nom === 't2_ombor_qoldiq_v2')!.body.p_actor_id).toBe(7);
  });
  it('ovoz: JSON audio_b64 BFF dan o\'tadi va STT bosqichigacha yetadi (multipart kerak emas)', async () => {
    const r = await bff('/api/ombor-buyruq', 'POST', { amal: 'tahlil', kompaniya_id: 8, sklad_id: 3, til: 'uz', mime: 'audio/mp4', audio_b64: btoa('synthetic-audio') });
    const code = ((await r.json()) as { code?: string }).code;
    expect(code).toBe('VOICE_NOT_CONFIGURED'); // sintetik env da STT kaliti yo'q; TARGET_INVALID / BODY_INVALID / AUDIO_INVALID emas
  });
  it('eksport va alias qurilmaga ochilmaydi; GET rad', async () => {
    for (const amal of ['eksport', 'alias', '']) expect((await bff('/api/ombor-buyruq', 'POST', { amal, kompaniya_id: 8, sklad_id: 3 })).status).toBe(400);
    expect((await bff('/api/ombor-buyruq')).status).toBe(400);
  });
});
describe('mobil BFF: kirish-taklif / jarvis', () => {
  const notTarget = async (r: Response) => expect(((await r.json().catch(() => ({}))) as { code?: string }).code).not.toBe('TARGET_INVALID');
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
describe('mobil BFF: Jarvis chat (agent-ish) is allowlisted by action', () => {
  const notTarget = async (r: Response) => expect(((await r.json().catch(() => ({}))) as { code?: string }).code).not.toBe('TARGET_INVALID');
  it.each(['kasb_savol', 'suhbat_royxat', 'suhbat_ol', 'suhbat_saqla', 'suhbat_ochir'])('allows %s', async amal => {
    await notTarget(await bff('/api/agent-ish', 'POST', { amal, kompaniya_id: 8, savol: 'salom' }));
  });
  it.each(['model_tanla', 'byudjet_belgila', 'ustama_belgila', 'model_openrouterdan_qosh', 'buyruq_yubor', 'bilim_yoz', 'harakat_qaror', '', undefined])('refuses admin action %s', async amal => {
    expect((await bff('/api/agent-ish', 'POST', { amal, kompaniya_id: 8 })).status).toBe(400);
  });
  it('refuses GET and a body-less POST', async () => {
    expect((await bff('/api/agent-ish', 'GET')).status).toBe(400);
    expect((await bff('/api/agent-ish', 'POST')).status).toBe(400);
  });
});
describe('mobil BFF: documents (hujjat-royxat list + hujjat-ol binary download)', () => {
  const bytes = new TextEncoder().encode('%PDF-1.4 synthetic');
  const stubDocs = () => {
    const base = globalThis.fetch as unknown as (raw: string, init?: RequestInit) => Promise<Response>;
    vi.stubGlobal('fetch', vi.fn(async (raw: string, init?: RequestInit) => {
      const u = new URL(String(raw));
      const b = init?.body ? JSON.parse(String(init.body)) : {};
      if (u.pathname.endsWith('/t2_document_registry_v1')) { calls.push({ path: u.pathname, body: b }); return Response.json({ ok: true, documents: [], health: [], jami: 0, drive_replica_failed: 0 }); }
      if (u.pathname.endsWith('/t2_document_canonical_get_v1')) {
        calls.push({ path: u.pathname, body: b });
        return Response.json({ ok: true, r2_key: 'k', blob_key: 'k', mime_type: 'application/pdf', original_filename: 'f2.pdf', size_bytes: bytes.length, sha256: 'x' });
      }
      if (u.pathname.includes('t2_document_registry')) return Response.json([]);
      if (u.pathname.endsWith('/t2_obyekt')) return Response.json([{ kompaniya_id: 8 }]);
      if (u.pathname.endsWith('/t2_men_v1')) return Response.json({ ok: true, platform_role: 'none', foydalanuvchi: { holat: 'faol' }, context_kompaniyalar: [{ kompaniya_id: 8, effective_role: 'pto', permissions: ['company.read', 'document.read'] }] });
      return base(raw, init);
    }));
  };
  it('lists the registry as the device actor', async () => {
    stubDocs();
    const r = await bff('/api/hujjat-royxat?kompaniya_id=8&obyekt_id=5&limit=100');
    expect(r.status).toBe(200);
    expect(calls.find(c => c.path.endsWith('/t2_document_registry_v1'))?.body).toMatchObject({ p_actor_id: 7, p_kompaniya_id: 8, p_obyekt_id: 5 });
  });
  it('streams the file bytes through the gateway (binary, no-store, no cookie leak)', async () => {
    stubDocs();
    const e = { ...env, R2_CANONICAL: { get: async () => ({ body: bytes, size: bytes.length }) } };
    const res = await gateway({ request: native({ path: '/api/hujjat-ol?id=12', method: 'GET' }), env: e, data: {}, next: vi.fn() } as never);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Set-Cookie')).toBeNull();
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
    expect(calls.find(c => c.path.endsWith('/t2_document_canonical_get_v1'))?.body).toEqual({ p_actor_id: 7, p_document_id: 12 });
  });
  it('refuses POST and a body on the document paths', async () => {
    expect((await bff('/api/hujjat-ol?id=1', 'POST', {})).status).toBe(400);
    expect((await bff('/api/hujjat-royxat?kompaniya_id=8', 'POST', {})).status).toBe(400);
  });
  it('routes the unified document engine (hujjat-yarat POST) through the same gates; GET is not exposed', async () => {
    stubDocs();
    const r = await bff('/api/hujjat-yarat', 'POST', { amal: 'royxat', kompaniya_id: 8 });
    expect(r.status).toBe(400);
    expect((await r.json() as { code: string }).code).toBe('PARAMETR_YOQ'); // handler reached after middleware (document.read for company 8)
    expect((await bff('/api/hujjat-yarat', 'GET')).status).toBe(400);
  });
});

describe('MOBIL_PATH allow-list: per-node sums', () => {
  it('obyekt-tugun-summa (GET, obyekt_id) is reachable; look-alikes are not', () => {
    expect(MOBIL_PATH.test('/api/obyekt-tugun-summa?obyekt_id=4')).toBe(true);
    expect(MOBIL_PATH.test('/api/obyekt-tugun-summa-x?obyekt_id=4')).toBe(false);
    expect(MOBIL_PATH.test('/api/obyekt-tugun')).toBe(false);
  });
});

describe('mobil BFF: sinov (bepul sinov, 1000 token) /api/company', () => {
  let rpcs: { nom: string; body: Record<string, unknown> }[];
  beforeEach(() => {
    rpcs = [];
    const base = globalThis.fetch as typeof fetch;
    vi.stubGlobal('fetch', vi.fn(async (raw: string, init?: RequestInit) => {
      const u = new URL(String(raw));
      const nom = /\/rpc\/([a-z0-9_]+)/.exec(u.pathname)?.[1];
      if (nom && nom.startsWith('t2_sinov_')) {
        rpcs.push({ nom, body: JSON.parse(String(init?.body ?? '{}')) });
        if (nom === 't2_sinov_holat_v1') return Response.json({ ok: true, boshlangan: false, kompaniya_id: null, haqiqiy: false, boshlash_mumkin: true, demo_obyekt_id: null, demo_mavjud: false, balans: null });
        if (nom === 't2_sinov_boshlash_v1') return Response.json({ ok: true, kompaniya_id: 31, bonus_token: 1000, balans: 1000 });
        return Response.json({ ok: true, kompaniya_id: 31, demo_obyekt_id: 77 });
      }
      if (nom === 't2_audit_yoz') return Response.json(null);
      return base(raw, init);
    }));
  });
  it('MOBIL_PATH keeps the ?sinov=1 query on /api/company', () => {
    expect(MOBIL_PATH.test('/api/company?sinov=1')).toBe(true);
    expect(MOBIL_PATH.test('/api/company-x?sinov=1')).toBe(false);
  });
  it('GET ?sinov=1 reads the trial state as the device actor', async () => {
    const r = await bff('/api/company?sinov=1');
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, boshlash_mumkin: true });
    expect(rpcs.map(x => x.nom)).toEqual(['t2_sinov_holat_v1']);
    expect(rpcs[0].body).toMatchObject({ p_actor_id: 7 });
  });
  it.each([['sinov_boshlash', 't2_sinov_boshlash_v1'], ['sinov_demo', 't2_sinov_demo_v1']])('POST %s reaches %s with the device actor', async (action, rpc) => {
    const r = await bff('/api/company', 'POST', { action, operation_id: '11111111-1111-4111-8111-111111111111' });
    expect(r.status).toBe(200);
    expect(rpcs.map(x => x.nom)).toContain(rpc);
    expect(rpcs.find(x => x.nom === rpc)?.body).toMatchObject({ p_actor_id: 7 });
  });
});