// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { base64url, deviceHash, ANDROID_ORIGIN } from '../_shared/desktop-device';
import { tekshir } from '../_shared/auth';
import { biletTekshir, biletYarat, biletYolYaroqli, BILET_MS } from '../_shared/mobil-bilet';
import { vakolatKeshTozala } from '../_shared/role-authority';
import { otaKeshTozala } from '../_shared/ota-kesh';
import { onRequestPost as issue } from './mobil/web-bilet';
import { onRequestGet as redeem } from './mobil/web-kirish';

const env = { SUPABASE_URL: 'https://synthetic.supabase.co', SUPABASE_KEY: 'synthetic-only', SESSIYA_KALIT: 'synthetic-only'.repeat(3) };
const deviceId = '00000000-0000-4000-8000-000000000001';
const token = base64url(new Uint8Array(32).fill(33));
beforeEach(() => {
  vakolatKeshTozala(); otaKeshTozala();
  vi.stubGlobal('fetch', vi.fn(async (raw: string, init?: RequestInit) => {
    const u = new URL(String(raw)); const b = init?.body ? JSON.parse(String(init.body)) : {};
    if (u.pathname.endsWith('/t2_desktop_qurilma_tekshir_v2')) return Response.json(b.p_token_hash === await deviceHash(token) ?
      { ok: true, device_id: deviceId, foydalanuvchi_id: 7, tugaydi: Date.now() + 86400_000, sessiya_exp: Date.now() + 86400_000, versiya: 1 } : { ok: false });
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
    expect(cookie).toMatch(/HttpOnly; Secure; SameSite=Lax; Path=\/; Max-Age=28800/);
    const s = await tekshir(cookie.split(';')[0], env.SESSIYA_KALIT);
    expect(s).toMatchObject({ foydalanuvchi_id: 7 });
    expect(s!.exp - Date.now()).toBeLessThanOrEqual(8 * 3600_000);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('rejects forged, tampered, expired and missing tickets without setting a cookie', async () => {
    const good = await biletYarat({ u: 7, r: 'pto', y: '/admin' }, env.SESSIYA_KALIT);
    const tampered = good.replace(/.$/, c => (c === 'A' ? 'B' : 'A'));
    const other = await biletYarat({ u: 7, r: 'pto', y: '/admin' }, 'another-secret-key-of-length-16');
    const old = await biletYarat({ u: 7, r: 'pto', y: '/admin' }, env.SESSIYA_KALIT, Date.now() - BILET_MS - 1000);
    for (const b of [tampered, other, old, 'x.y', '']) {
      const res = await redeem(ctx(new Request('https://site.test/api/mobil/web-kirish?b=' + encodeURIComponent(b))));
      expect([400, 410]).toContain(res.status);
      expect(res.headers.get('Set-Cookie')).toBeNull();
    }
    expect(await biletTekshir(good, env.SESSIYA_KALIT)).toMatchObject({ u: 7, y: '/admin' });
  });
});
