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
  it('bounds body size to 2 MB', async () => {
    expect((await gateway(ctx(native({ path: '/api/sb', method: 'POST', body: 'a'.repeat(2 * 1024 * 1024) })))).status).toBe(413);
  });
  it('refuses a GET with body and a malformed envelope', async () => {
    expect((await gateway(ctx(native({ path: '/api/sessiya', method: 'GET', body: {} })))).status).toBe(400);
    expect((await gateway(ctx(native({ path: '/api/sessiya', method: 'GET', extra: 1 })))).status).toBe(400);
  });
});