// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ANDROID_ORIGIN, base64url, deviceHash } from '../_shared/desktop-device';
import { vakolatKeshTozala } from '../_shared/role-authority';
import { AVATAR_MAX_BYTES, avatarKalit, onRequestDelete, onRequestGet, onRequestPost, rasmTuri } from './mobil/avatar';

const deviceId = '00000000-0000-4000-8000-000000000001';
const token = base64url(new Uint8Array(32).fill(33));
const store = new Map<string, { v: Uint8Array; type?: string }>();
const R2_CANONICAL = {
  put: vi.fn(async (k: string, v: Uint8Array, o?: { httpMetadata?: { contentType?: string } }) => { store.set(k, { v, type: o?.httpMetadata?.contentType }); }),
  get: vi.fn(async (k: string) => { const e = store.get(k); return e ? { body: e.v, httpMetadata: { contentType: e.type } } : null; }),
  head: vi.fn(), delete: vi.fn(async (k: string) => { store.delete(k); }),
};
const env = { SUPABASE_URL: 'https://synthetic.supabase.co', SUPABASE_KEY: 'synthetic-only', SESSIYA_KALIT: 'synthetic-only'.repeat(3), R2_CANONICAL };
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 4, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

beforeEach(() => {
  store.clear(); vakolatKeshTozala(); vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn(async (raw: string, init?: RequestInit) => {
    const u = new URL(String(raw)); const b = init?.body ? JSON.parse(String(init.body)) : {};
    if (u.pathname.endsWith('/t2_desktop_qurilma_tekshir_v2')) return Response.json(b.p_token_hash === await deviceHash(token) ?
      { ok: true, device_id: deviceId, foydalanuvchi_id: 7, tugaydi: Date.now() + 86400_000, sessiya_exp: Date.now() + 86400_000, versiya: 1 } : { ok: false });
    if (u.pathname.endsWith('/t2_men_v1')) return Response.json({ ok: true, platform_role: 'none', foydalanuvchi: { holat: 'faol' }, context_kompaniyalar: [{ kompaniya_id: 8, effective_role: 'pto', permissions: ['company.read'] }] });
    throw new Error('Unexpected synthetic upstream: ' + u.pathname);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vakolatKeshTozala(); });

const req = (method: string, body?: Uint8Array, type = 'image/jpeg', bearer = token, origin = ANDROID_ORIGIN) =>
  new Request('https://site.test/api/mobil/avatar', { method, headers: { Authorization: 'Bearer ' + bearer, Origin: origin, ...(body ? { 'Content-Type': type } : {}) }, ...(body ? { body } : {}) });
const call = (h: PagesFunction<any>, r: Request) => h({ request: r, env, data: {}, next: vi.fn() } as never) as Promise<Response>;
const big = (n: number, head: Uint8Array) => { const a = new Uint8Array(n); a.set(head); return a; };

describe('mobil avatar (own profile photo -> R2 via r2Yoz)', () => {
  it('detects the real type from magic bytes', () => {
    expect(rasmTuri(JPEG)).toBe('image/jpeg'); expect(rasmTuri(PNG)).toBe('image/png'); expect(rasmTuri(WEBP)).toBe('image/webp');
    expect(rasmTuri(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBeNull();
    expect(rasmTuri(new Uint8Array([0x4d, 0x5a, 0x90, 0]))).toBeNull();
  });
  it('rejects a missing/unknown device token and a wrong origin', async () => {
    expect((await call(onRequestGet, req('GET', undefined, '', base64url(new Uint8Array(32).fill(9))))).status).toBe(401);
    expect((await call(onRequestPost, req('POST', JPEG, 'image/jpeg', token, 'https://evil.test'))).status).toBe(401);
  });
  it.each([['image/jpeg', JPEG], ['image/png', PNG], ['image/webp', WEBP]] as const)('stores %s under the actor-derived key and serves it back', async (type, bytes) => {
    const up = await call(onRequestPost, req('POST', bytes, type));
    expect(up.status).toBe(200);
    expect(R2_CANONICAL.put).toHaveBeenCalledTimes(1);
    expect(R2_CANONICAL.put.mock.calls[0][0]).toBe(avatarKalit(7));
    expect(avatarKalit(7)).toBe('avatar/u7/foto');
    const down = await call(onRequestGet, req('GET'));
    expect(down.status).toBe(200);
    expect(down.headers.get('Content-Type')).toBe(type);
    expect(new Uint8Array(await down.arrayBuffer())).toEqual(bytes);
  });
  it('refuses: header/magic mismatch, unsupported type, oversize, empty', async () => {
    expect((await call(onRequestPost, req('POST', PNG, 'image/jpeg'))).status).toBe(400);
    expect((await call(onRequestPost, req('POST', new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]), 'image/gif'))).status).toBe(400);
    expect((await call(onRequestPost, req('POST', big(AVATAR_MAX_BYTES + 1, JPEG)))).status).toBe(413);
    expect((await call(onRequestPost, req('POST', new Uint8Array(0)))).status).toBe(400);
    expect(R2_CANONICAL.put).not.toHaveBeenCalled();
  });
  it('accepts exactly the 2 MiB limit', async () => {
    expect((await call(onRequestPost, req('POST', big(AVATAR_MAX_BYTES, JPEG)))).status).toBe(200);
  });
  it('GET is 404 AVATAR_YOQ when none, DELETE removes it', async () => {
    expect((await call(onRequestGet, req('GET'))).status).toBe(404);
    await call(onRequestPost, req('POST', PNG, 'image/png'));
    expect((await call(onRequestDelete, req('DELETE'))).status).toBe(200);
    expect((await call(onRequestGet, req('GET'))).status).toBe(404);
  });
});
