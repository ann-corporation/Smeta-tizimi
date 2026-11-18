// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ANDROID_ORIGIN, base64url, deviceHash } from '../_shared/desktop-device';
import { vakolatKeshTozala } from '../_shared/role-authority';
import { onRequestPost, onRequestPut, MOBIL_HM_BIR_MARTA_MAX } from './mobil/hujjat-yukla';
import { HM_BOLAK_QISM } from '../_shared/hujjat-maydoni-bolak';

const deviceId = '00000000-0000-4000-8000-000000000001';
const token = base64url(new Uint8Array(32).fill(33));
const UUID = '11111111-2222-4333-8444-555555555555';
const objs = new Map<string, Uint8Array>();
const R2_CANONICAL = {
  put: vi.fn(async (k: string, v: Uint8Array) => { objs.set(k, v); }),
  get: vi.fn(async () => null), head: vi.fn(), delete: vi.fn(),
  createMultipartUpload: vi.fn(async () => ({ uploadId: 'up1' })),
  resumeMultipartUpload: () => ({ uploadPart: async (n: number) => ({ partNumber: n, etag: 'e' + n }), complete: async () => ({ size: HM_BOLAK_QISM + 10 }), abort: async () => undefined }),
};
const env = { SUPABASE_URL: 'https://synthetic.supabase.co', SUPABASE_KEY: 'synthetic-only', SESSIYA_KALIT: 'synthetic-only'.repeat(3), R2_CANONICAL };
const rpcs: Array<{ nom: string; args: any }> = [];
beforeEach(() => {
  objs.clear(); rpcs.length = 0; vakolatKeshTozala(); vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn(async (raw: string, init?: RequestInit) => {
    const u = new URL(String(raw)); const b = init?.body ? JSON.parse(String(init.body)) : {};
    if (u.pathname.endsWith('/t2_desktop_qurilma_tekshir_v2')) return Response.json(b.p_token_hash === await deviceHash(token) ?
      { ok: true, device_id: deviceId, foydalanuvchi_id: 7, tugaydi: Date.now() + 86400_000, sessiya_exp: Date.now() + 86400_000, versiya: 1 } : { ok: false });
    if (u.pathname.endsWith('/t2_men_v1')) return Response.json({ ok: true, platform_role: 'none', foydalanuvchi: { holat: 'faol' }, context_kompaniyalar: [{ kompaniya_id: 8, effective_role: 'pto', permissions: ['company.read'] }] });
    const nom = u.pathname.split('/rpc/')[1]; rpcs.push({ nom, args: b });
    if (nom === 't2_hm_yuklash_reserve_v1') return Response.json({ ok: true, fayl_id: 1, versiya_id: 9, raqam: 1, r2_kalit: 'docs/8/0/0/f1/r1', yangi: true });
    return Response.json({ ok: true, fayl_id: 1, raqam: 1 });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vakolatKeshTozala(); });

const hdr = (extra: Record<string, string> = {}, bearer = token, origin = ANDROID_ORIGIN) => ({ Authorization: 'Bearer ' + bearer, Origin: origin, ...extra });
const call = (h: PagesFunction<any>, r: Request) => h({ request: r, env, data: {}, next: vi.fn() } as never) as Promise<Response>;

describe('mobil/hujjat-yukla (Disk: Android/Windows yuklash)', () => {
  it('qurilma tokeni yo‘q yoki origin noto‘g‘ri = 401, hech narsa yozilmaydi', async () => {
    const f = new FormData(); f.set('fayl', new File(['x'], 'a.pdf')); f.set('operation_id', UUID);
    expect((await call(onRequestPost, new Request('https://s.test/api/mobil/hujjat-yukla', { method: 'POST', headers: hdr({}, base64url(new Uint8Array(32).fill(9))), body: f }))).status).toBe(401);
    expect((await call(onRequestPost, new Request('https://s.test/api/mobil/hujjat-yukla', { method: 'POST', headers: hdr({}, token, 'https://evil.test'), body: f }))).status).toBe(401);
    expect(R2_CANONICAL.put).not.toHaveBeenCalled();
  });
  it('bir martalik multipart: aktor = qurilma egasi (7), body dagi actor_id e’tiborsiz', async () => {
    const f = new FormData(); f.set('fayl', new File([new Uint8Array(20)], 'a.pdf', { type: 'application/pdf' })); f.set('operation_id', UUID); f.set('kompaniya_id', '8'); f.set('actor_id', '999');
    const r = await call(onRequestPost, new Request('https://s.test/api/mobil/hujjat-yukla', { method: 'POST', headers: hdr(), body: f }));
    expect(r.status).toBe(200); expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(rpcs.find((x) => x.nom === 't2_hm_yuklash_reserve_v1')!.args).toMatchObject({ p_actor: 7, p_kompaniya: 8 });
    expect(R2_CANONICAL.put).toHaveBeenCalledTimes(1);
  });
  it('bir martalik: juda katta e’lon = 413 (bo‘lakli yuklash kerak)', async () => {
    const f = new FormData(); f.set('fayl', new File(['x'], 'a.pdf')); f.set('operation_id', UUID);
    const r = await call(onRequestPost, new Request('https://s.test/api/mobil/hujjat-yukla', { method: 'POST', headers: hdr({ 'Content-Length': String(MOBIL_HM_BIR_MARTA_MAX + 200_000) }), body: f }));
    expect(r.status).toBe(413);
  });
  it('bo‘lakli oqim qurilma aktori bilan: boshla -> qism (PUT) -> tugat', async () => {
    const bayt = HM_BOLAK_QISM + 10;
    const b = await (await call(onRequestPost, new Request('https://s.test/api/mobil/hujjat-yukla?amal=boshla', { method: 'POST', headers: hdr({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ nom: 'katta.mp4', mime: 'video/mp4', bayt, sha256: 'a'.repeat(64), operation_id: UUID, kompaniya_id: 8 }) }))).json() as any;
    expect(b.ok).toBe(true); expect(rpcs[0].args.p_actor).toBe(7);
    const q = await call(onRequestPut, new Request(`https://s.test/api/mobil/hujjat-yukla?amal=qism&t=${encodeURIComponent(b.yukla_id)}&n=2`, { method: 'PUT', headers: hdr(), body: new Uint8Array(10) }));
    expect((await q.json() as any).etag).toBe('e2');
    const t = await call(onRequestPost, new Request('https://s.test/api/mobil/hujjat-yukla?amal=tugat', { method: 'POST', headers: hdr({ 'Content-Type': 'application/json' }), body: JSON.stringify({ t: b.yukla_id, qismlar: [{ n: 1, etag: 'e1' }, { n: 2, etag: 'e2' }] }) }));
    expect((await t.json() as any).ok).toBe(true);
    expect(rpcs.map((x) => x.nom)).toContain('t2_hm_yuklash_tasdiq_v1');
  });
});
