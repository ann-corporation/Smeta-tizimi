// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { base64url, deviceHash, ANDROID_ORIGIN } from '../_shared/desktop-device';
import { tekshir } from '../_shared/auth';
import { biletKeshTozala, biletTekshir, biletYarat, biletYolYaroqli, BILET_MS, hashSifrla, webKeshTozala, WEB_SESSIYA_MS } from '../_shared/mobil-bilet';
import { onRequest as middleware } from './_middleware';
import { vakolatKeshTozala } from '../_shared/role-authority';
import { otaKeshTozala } from '../_shared/ota-kesh';
import { onRequestPost as issue } from './mobil/web-bilet';
import { onRequestGet as redeem } from './mobil/web-kirish';

const env = { SUPABASE_URL: 'https://synthetic.supabase.co', SUPABASE_KEY: 'synthetic-only', SESSIYA_KALIT: 'synthetic-only'.repeat(3) };
const deviceId = '00000000-0000-4000-8000-000000000001';
const token = base64url(new Uint8Array(32).fill(33));
let alive = true; let tekshirCalls = 0;
beforeEach(() => {
  alive = true; tekshirCalls = 0; biletKeshTozala(); webKeshTozala();
  vakolatKeshTozala(); otaKeshTozala();
  vi.stubGlobal('fetch', vi.fn(async (raw: string, init?: RequestInit) => {
    const u = new URL(String(raw)); const b = init?.body ? JSON.parse(String(init.body)) : {};
    if (u.pathname.endsWith('/t2_desktop_qurilma_tekshir_v2')) { tekshirCalls++; return Response.json(alive && b.p_token_hash === await deviceHash(token) ?
      { ok: true, device_id: deviceId, foydalanuvchi_id: 7, tugaydi: Date.now() + 86400_000, sessiya_exp: Date.now() + 86400_000, versiya: 1 } : { ok: false }); }
    throw new Error('Unexpected synthetic upstream: ' + u.pathname);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vakolatKeshTozala(); otaKeshTozala(); });
const ctx = (request: Request) => ({ request, env, data: {}, next: vi.fn() } as never);
const ask = (yol: unknown, bearer = token, origin = ANDROID_ORIGIN) => issue(ctx(new Request('https://site.test/api/mobil/web-bilet', { method: 'POST',
  headers: { Authorization: 'Bearer ' + bearer, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ yol }) })));

describe('mobil web ticket', () => {
  it.each(['/admin', '/admin/obyektlar/12', '/admin/f2?x=1'])('accepts path %s', p => expect(biletYolYaroqli(p)).toBe(true));
  it.each(['https://evil.test/admin', '//evil.test', '/api/kirish', '/admin/../api/x', '/admin\\x', '/adminx', 5, '/admin/' + 'a'.repeat(300)])('rejects path %j', p => expect(biletYolYaroqli(p)).toBe(false));

  it('issues only for a verified device and a valid path', async () => {
    expect((await ask('/admin/obyektlar', base64url(new Uint8Array(32).fill(9)))).status).toBe(401);
    expect((await ask('/admin/obyektlar', token, 'https://smeta-tizimi.pages.dev')).status).toBe(401);
    expect((await ask('https://evil.test')).status).toBe(400);
    const r = await ask('/admin/obyektlar');
    expect(r.status).toBe(200);
    expect(((await r.json()) as { url: string }).url).toMatch(/^https:\/\/site\.test\/api\/mobil\/web-kirish\?b=/);
  });

  it('redeems into a short-lived cookie and redirects to the ticket path only', async () => {
    const url = ((await (await ask('/admin/obyektlar')).json()) as { url: string }).url;
    const res = await redeem(ctx(new Request(url)));
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/admin/obyektlar');
    const cookie = res.headers.get('Set-Cookie')!;
    expect(cookie).toMatch(/HttpOnly; Secure; SameSite=Lax; Path=\/; Max-Age=7200/);
    const s = await tekshir(cookie.split(';')[0], env.SESSIYA_KALIT);
    expect(s).toMatchObject({ foydalanuvchi_id: 7 });
    expect(s!.exp - Date.now()).toBeLessThanOrEqual(2 * 3600_000);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('rejects forged, tampered, expired and missing tickets without setting a cookie', async () => {
    const good = await biletYarat({ u: 7, r: 'pto', y: '/admin', d: deviceId, h: 'x' }, env.SESSIYA_KALIT);
    const tampered = good.replace(/.$/, c => (c === 'A' ? 'B' : 'A'));
    const other = await biletYarat({ u: 7, r: 'pto', y: '/admin', d: deviceId, h: 'x' }, 'another-secret-key-of-length-16');
    const old = await biletYarat({ u: 7, r: 'pto', y: '/admin', d: deviceId, h: 'x' }, env.SESSIYA_KALIT, Date.now() - BILET_MS - 1000);
    for (const b of [tampered, other, old, 'x.y', '']) {
      const res = await redeem(ctx(new Request('https://site.test/api/mobil/web-kirish?b=' + encodeURIComponent(b))));
      expect([400, 410]).toContain(res.status);
      expect(res.headers.get('Set-Cookie')).toBeNull();
    }
    expect(await biletTekshir(good, env.SESSIYA_KALIT)).toMatchObject({ u: 7, y: '/admin' });
  });

  async function login() {
    const url = ((await (await ask('/admin/obyektlar')).json()) as { url: string }).url;
    const res = await redeem(ctx(new Request(url)));
    return { url, res, cookie: res.headers.get('Set-Cookie')!.split(';')[0] };
  }
  const web = (cookie: string, path = '/api/kirish-google') => middleware({ request: new Request('https://site.test' + path, { headers: { Cookie: cookie } }),
    env, data: {}, next: async () => Response.json({ ok: true }) } as never);

  it('ticket is single use: a replay is refused and sets no cookie', async () => {
    const { url, res } = await login();
    expect(res.status).toBe(302);
    const again = await redeem(ctx(new Request(url)));
    expect(again.status).toBe(410);
    expect(again.headers.get('Set-Cookie')).toBeNull();
  });

  it('single use also goes through the DB when MOBIL_BILET_BIR_MARTALIK=1 and fails closed if the DB is unavailable', async () => {
    const url = ((await (await ask('/admin')).json()) as { url: string }).url;
    const base = globalThis.fetch as unknown as (raw: string, init?: RequestInit) => Promise<Response>;
    const seen: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (raw: string, init?: RequestInit) => {
      if (String(raw).endsWith('/t2_mobil_bilet_ishlat_v1')) { seen.push(JSON.parse(String(init?.body)).p_jti); return Response.json({ ok: true }); }
      return base(raw, init);
    }));
    const on = { ...env, MOBIL_BILET_BIR_MARTALIK: '1' };
    expect((await redeem({ request: new Request(url), env: on, data: {}, next: vi.fn() } as never)).status).toBe(302);
    expect(seen).toHaveLength(1);
    biletKeshTozala();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 500 })));
    expect((await redeem({ request: new Request(url), env: on, data: {}, next: vi.fn() } as never)).status).toBe(410);
  });

  it('cookie is device-bound: works while the device is live, 401 once it is revoked', async () => {
    const { cookie } = await login();
    expect((await web(cookie)).status).toBe(200);
    expect(tekshirCalls).toBeGreaterThan(0);
    alive = false; webKeshTozala();
    const r = await web(cookie);
    expect(r.status).toBe(401);
    expect(await r.json()).toMatchObject({ code: 'AUTH_REQUIRED' });
  });

  it('a normal (non-web) cookie is not affected by the gate and a cookie for another device id is refused', async () => {
    const { imzola } = await import('../_shared/auth');
    const plain = 'sess=' + await imzola({ rol: 'pto', foydalanuvchi_id: 7 }, env.SESSIYA_KALIT);
    const before = tekshirCalls;
    expect((await web(plain)).status).toBe(200);
    expect(tekshirCalls).toBe(before);
    const other = 'sess=' + await imzola({ rol: 'pto', foydalanuvchi_id: 7, wd: '00000000-0000-4000-8000-000000000002',
      wh: await hashSifrla(await deviceHash(token), env.SESSIYA_KALIT), wi: Date.now() } as never, env.SESSIYA_KALIT);
    expect((await web(other)).status).toBe(401);
    const noHash = 'sess=' + await imzola({ rol: 'pto', foydalanuvchi_id: 7, wd: deviceId, wh: 'garbage', wi: Date.now() } as never, env.SESSIYA_KALIT);
    expect((await web(noHash)).status).toBe(401);
  });

  it('expires after the 2 h window and after the 12 h absolute cap; slides while in use', async () => {
    const { webCookie } = await import('../_shared/mobil-bilet');
    const wh = await hashSifrla(await deviceHash(token), env.SESSIYA_KALIT);
    const mk = async (ageMs: number, issuedAgoMs: number) => {
      const v = await webCookie({ rol: 'pto', u: 7, d: deviceId, wh, wi: Date.now() - ageMs }, env.SESSIYA_KALIT, Date.now() - issuedAgoMs);
      return v.split(';')[0];
    };
    expect(await tekshir(await mk(0, WEB_SESSIYA_MS + 1000), env.SESSIYA_KALIT)).toBeNull(); // 2 h window passed: the cookie itself is dead
    expect((await web(await mk(13 * 3600_000, 0))).status).toBe(401);                    // 12 h absolute cap
    const fresh = await web(await mk(0, 0));
    expect(fresh.status).toBe(200); expect(fresh.headers.get('Set-Cookie')).toBeNull();  // just issued: no refresh
    const slid = await web(await mk(0, 10 * 60_000));
    expect(slid.status).toBe(200);
    expect(slid.headers.get('Set-Cookie')).toMatch(/^sess=.+Max-Age=7200/);              // 10 min old: slid for another 2 h
  });
});