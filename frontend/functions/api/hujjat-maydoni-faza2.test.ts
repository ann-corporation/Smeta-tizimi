// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { onRequestPost as yukla, onRequestPut as yuklaPut } from './hujjat-maydoni-yukla';
import { onRequestGet as ol } from './hujjat-maydoni-ol';
import { onRequestGet as oqi, onRequestPost as amal } from './hujjat-maydoni';
import { HM_BOLAK_QISM, bolakTokenOl } from '../_shared/hujjat-maydoni-bolak';
import { sha256Hex } from '../_shared/r2-saqlash';
import { imzola } from '../_shared/auth';

const KEY = 'k'.repeat(32);
const UUID = '11111111-2222-4333-8444-555555555555';
afterEach(() => vi.unstubAllGlobals());

function r2() {
  const objs = new Map<string, Uint8Array>(); const parts = new Map<string, Map<number, Uint8Array>>(); let n = 0;
  const u8 = (v: unknown) => (typeof v === 'string' ? new TextEncoder().encode(v) : v as Uint8Array);
  const bucket = {
    put: vi.fn(async (k: string, v: unknown) => { objs.set(k, u8(v)); }),
    get: vi.fn(async (k: string) => { const o = objs.get(k); return o ? { body: new Blob([o as unknown as ArrayBuffer]).stream(), text: async () => new TextDecoder().decode(o), arrayBuffer: async () => o.buffer } : null; }),
    head: vi.fn(), delete: vi.fn(async (k: string) => { objs.delete(k); }),
    createMultipartUpload: vi.fn(async () => { const id = 'up' + ++n; parts.set(id, new Map()); return { uploadId: id }; }),
    resumeMultipartUpload: (k: string, id: string) => ({
      uploadPart: async (p: number, v: Uint8Array) => { parts.get(id)!.set(p, v); return { partNumber: p, etag: 'e' + p }; },
      complete: async (ps: Array<{ partNumber: number }>) => { const all = ps.map((x) => parts.get(id)!.get(x.partNumber)!); const o = new Uint8Array(all.reduce((a, b) => a + b.length, 0)); let i = 0; for (const b of all) { o.set(b, i); i += b.length; } objs.set(k, o); return { size: o.length }; },
      abort: async () => { parts.delete(id); },
    }),
  };
  return { bucket: bucket as unknown as R2Bucket, raw: bucket, objs };
}
const ENV = (bucket: R2Bucket) => ({ SUPABASE_URL: 'https://a.supabase.co', SUPABASE_KEY: 'k', SESSIYA_KALIT: KEY, R2_CANONICAL: bucket });
const kuki = async (id = 5) => 'sess=' + await imzola({ rol: 'pto', foydalanuvchi_id: id, kompaniyalar: [{ kompaniya_id: 17, rol: 'pto' }] }, KEY);
function rpcMock(j: Record<string, unknown>) {
  const c: Array<{ nom: string; args: any }> = [];
  vi.stubGlobal('fetch', vi.fn(async (u: string, init?: RequestInit) => {
    const nom = String(u).split('/rpc/')[1]; c.push({ nom, args: init?.body ? JSON.parse(String(init.body)) : null });
    return Response.json((j[nom] as object) ?? { ok: true });
  }));
  return c;
}
const RESERVE = { ok: true, fayl_id: 1, versiya_id: 9, raqam: 1, r2_kalit: 'docs/17/0/0/f1/r1', yangi: true };
const post = async (url: string, body: unknown, env: any, id = 5) => yukla({ request: new Request(url, { method: 'POST', headers: { Cookie: await kuki(id) }, body: JSON.stringify(body) }), env } as never);
const qism = async (t: string, n: number, bytes: Uint8Array, env: any, id = 5) => yuklaPut({ request: new Request(`https://x/api/hujjat-maydoni-yukla?amal=qism&t=${encodeURIComponent(t)}&n=${n}`, { method: 'PUT', headers: { Cookie: await kuki(id) }, body: bytes }), env } as never);
const BASE = 'https://x/api/hujjat-maydoni-yukla?amal=';

describe('bo‘lakli yuklash (R2 multipart)', () => {
  const bayt = HM_BOLAK_QISM + 1000;
  const data = new Uint8Array(bayt).map((_, i) => i % 251);
  const boshla = (env: any, sha: string, extra: Record<string, unknown> = {}) => post(BASE + 'boshla', { nom: 'katta.pdf', mime: 'application/pdf', bayt, sha256: sha, operation_id: UUID, kompaniya_id: 17, ...extra }, env);

  it('to‘liq oqim: boshla -> 2 qism -> tugat; kvota boshlashda, hajm va sha tugatishda; aktor sessiyadan', async () => {
    const c = rpcMock({ t2_hm_yuklash_reserve_v1: RESERVE, t2_hm_yuklash_tasdiq_v1: { ok: true, fayl_id: 1, raqam: 1 } });
    const s = r2(); const env = ENV(s.bucket); const sha = await sha256Hex(data);
    const b = await (await boshla(env, sha, { actor_id: 999 })).json() as any;
    expect(b).toMatchObject({ ok: true, qism_bayt: HM_BOLAK_QISM, qismlar: 2 });
    expect(c[0].args).toMatchObject({ p_actor: 5, p_bayt: bayt, p_kompaniya: 17 });
    const q1 = await (await qism(b.yukla_id, 1, data.subarray(0, HM_BOLAK_QISM), env)).json() as any;
    const q2 = await (await qism(b.yukla_id, 2, data.subarray(HM_BOLAK_QISM), env)).json() as any;
    expect([q1.etag, q2.etag]).toEqual(['e1', 'e2']);
    const t = await post(BASE + 'tugat', { t: b.yukla_id, qismlar: [{ n: 1, etag: q1.etag }, { n: 2, etag: q2.etag }] }, env);
    expect((await t.json() as any).ok).toBe(true);
    expect(s.objs.get('docs/17/0/0/f1/r1')!.length).toBe(bayt);
    expect(c.map((x) => x.nom)).toEqual(['t2_hm_yuklash_reserve_v1', 't2_hm_yuklash_tasdiq_v1']);
  });
  it('kvota tugagan: 413, R2 multipart ochilmaydi', async () => {
    rpcMock({ t2_hm_yuklash_reserve_v1: { ok: false, code: 'KVOTA_TUGADI', ishlatilgan: 1, limit: 1 } });
    const s = r2(); const r = await boshla(ENV(s.bucket), 'a'.repeat(64));
    expect(r.status).toBe(413); expect(s.raw.createMultipartUpload).not.toHaveBeenCalled();
  });
  it('200 MB dan katta, taqiqlangan tur, sha yo‘q: rad', async () => {
    rpcMock({}); const s = r2(); const env = ENV(s.bucket);
    expect((await boshla(env, 'a'.repeat(64), { bayt: 201 * 1024 * 1024 })).status).toBe(413);
    expect((await boshla(env, 'a'.repeat(64), { nom: 'v.exe' })).status).toBe(415);
    expect((await boshla(env, 'zz')).status).toBe(400);
  });
  it('qism: noto‘g‘ri hajm, soxta token, boshqa aktor tokeni rad', async () => {
    rpcMock({ t2_hm_yuklash_reserve_v1: RESERVE }); const s = r2(); const env = ENV(s.bucket);
    const b = await (await boshla(env, 'a'.repeat(64))).json() as any;
    expect((await qism(b.yukla_id, 1, new Uint8Array(10), env)).status).toBe(400);
    expect((await qism(b.yukla_id, 3, data.subarray(0, 10), env)).status).toBe(400);
    expect((await qism(b.yukla_id + 'x', 1, data.subarray(0, HM_BOLAK_QISM), env)).status).toBe(400);
    expect((await qism(b.yukla_id, 1, data.subarray(0, HM_BOLAK_QISM), env, 77)).status).toBe(400);
    expect(await bolakTokenOl(env as never, b.yukla_id, 5)).not.toBeNull();
    expect(await bolakTokenOl(env as never, b.yukla_id, 6)).toBeNull();
  });
  it('tugat: qismlar yetmasa 400; sha mos kelmasa bekor (R2 o‘chadi, kvota qaytadi)', async () => {
    const c = rpcMock({ t2_hm_yuklash_reserve_v1: RESERVE, t2_hm_yuklash_tasdiq_v1: { ok: true, fayl_id: 1, raqam: 1 } });
    const s = r2(); const env = ENV(s.bucket);
    const b = await (await boshla(env, 'f'.repeat(64))).json() as any;
    expect((await post(BASE + 'tugat', { t: b.yukla_id, qismlar: [{ n: 1, etag: 'e1' }] }, env)).status).toBe(400);
    await qism(b.yukla_id, 1, data.subarray(0, HM_BOLAK_QISM), env); await qism(b.yukla_id, 2, data.subarray(HM_BOLAK_QISM), env);
    (crypto as any).DigestStream = class extends WritableStream { digest: Promise<ArrayBuffer>; constructor(a: string) { const ch: Uint8Array[] = []; let res!: (v: ArrayBuffer) => void; const p = new Promise<ArrayBuffer>((r) => { res = r; });
      super({ write(x) { ch.push(x); }, close() { const o = new Uint8Array(ch.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of ch) { o.set(x, i); i += x.length; } res(crypto.subtle.digest(a, o) as unknown as ArrayBuffer); } }); this.digest = p; } };
    try {
      const t = await post(BASE + 'tugat', { t: b.yukla_id, qismlar: [{ n: 1, etag: 'e1' }, { n: 2, etag: 'e2' }] }, env);
      expect(t.status).toBe(422); expect((await t.json() as any).code).toBe('SHA_MOS_EMAS');
      expect(c.map((x) => x.nom)).toContain('t2_hm_yuklash_bekor_v1'); expect(c.map((x) => x.nom)).not.toContain('t2_hm_yuklash_tasdiq_v1');
      expect(s.objs.has('docs/17/0/0/f1/r1')).toBe(false);
    } finally { delete (crypto as any).DigestStream; }
  });
  it('bekor: multipart bekor + kutish qatori; yaroqsiz token zararsiz', async () => {
    const c = rpcMock({ t2_hm_yuklash_reserve_v1: RESERVE }); const s = r2(); const env = ENV(s.bucket);
    const b = await (await boshla(env, 'a'.repeat(64))).json() as any;
    expect((await (await post(BASE + 'bekor', { t: b.yukla_id }, env)).json() as any).ok).toBe(true);
    expect(c.map((x) => x.nom)).toContain('t2_hm_yuklash_bekor_v1');
    expect((await (await post(BASE + 'bekor', { t: 'yoq' }, env)).json() as any).ok).toBe(true);
  });
});

describe('matn indeksi va qidiruv', () => {
  const docx = zipSync({ 'word/document.xml': strToU8('<w:document><w:p><w:r><w:t>Poydevor uchun armatura va beton yetkazib berish shartnomasi</w:t></w:r></w:p></w:document>') });
  it('yuklashdan keyin matn R2 ga (.txt) va ixcham indeks RPC ga yoziladi; eski matn obyekti o‘chadi', async () => {
    const c = rpcMock({ t2_hm_yuklash_reserve_v1: RESERVE, t2_hm_yuklash_tasdiq_v1: { ok: true, fayl_id: 1, raqam: 1 }, t2_hm_matn_yoz_v1: { ok: true, eski_kalit: 'docs/17/0/0/f1/r0.txt' } });
    const s = r2(); const f = new FormData(); f.set('fayl', new File([docx as unknown as ArrayBuffer], 'shartnoma.docx')); f.set('operation_id', UUID); f.set('kompaniya_id', '17');
    const res = await yukla({ request: new Request('https://x/api/hujjat-maydoni-yukla', { method: 'POST', headers: { Cookie: await kuki() }, body: f }), env: ENV(s.bucket) } as never);
    expect((await res.json() as any).ok).toBe(true);
    const m = c.find((x) => x.nom === 't2_hm_matn_yoz_v1')!.args;
    expect(m).toMatchObject({ p_actor: 5, p_versiya_id: 9, p_r2_kalit: 'docs/17/0/0/f1/r1.txt' });
    expect(m.p_norm).toContain('armatura'); expect(m.p_belgi).toBeGreaterThan(20);
    expect(new TextDecoder().decode(s.objs.get('docs/17/0/0/f1/r1.txt'))).toContain('Poydevor');
    expect(s.raw.delete).toHaveBeenCalledWith('docs/17/0/0/f1/r0.txt');
  });
  it('indeks RPC rad etsa matn obyekti qoldirilmaydi; yuklash baribir muvaffaqiyatli', async () => {
    rpcMock({ t2_hm_yuklash_reserve_v1: RESERVE, t2_hm_yuklash_tasdiq_v1: { ok: true, fayl_id: 1, raqam: 1 }, t2_hm_matn_yoz_v1: { ok: false, code: 'RUXSAT_YOQ' } });
    const s = r2(); const f = new FormData(); f.set('fayl', new File([docx as unknown as ArrayBuffer], 'shartnoma.docx')); f.set('operation_id', UUID);
    const res = await yukla({ request: new Request('https://x/api/hujjat-maydoni-yukla', { method: 'POST', headers: { Cookie: await kuki() }, body: f }), env: ENV(s.bucket) } as never);
    expect((await res.json() as any).ok).toBe(true); expect(s.objs.has('docs/17/0/0/f1/r1.txt')).toBe(false);
  });
  it('qidir: so‘rov normallashtiriladi (kirill = lotin), mazmun natijasiga parcha qo‘shiladi, ichki kalit mijozga chiqmaydi', async () => {
    const c = rpcMock({ t2_hm_qidir_v1: { ok: true, royxat: [{ id: 1, nom: 'a.docx', mos: 'matn', matn_kalit: 'docs/k.txt' }, { id: 2, nom: 'armatura.pdf', mos: 'nom', matn_kalit: null }] } });
    const s = r2(); s.objs.set('docs/k.txt', new TextEncoder().encode('Poydevor uchun Armatura va beton yetkazib berish shartnomasi'));
    const res = await oqi({ request: new Request('https://x/api/hujjat-maydoni?amal=qidir&q=' + encodeURIComponent('Арматура'), { headers: { Cookie: await kuki() } }), env: ENV(s.bucket) } as never);
    const j = await res.json() as any;
    expect(c[0].args).toMatchObject({ p_actor: 5, p_q_norm: 'armatura' });
    expect(j.royxat[0].parcha).toContain('Armatura'); expect(JSON.stringify(j)).not.toContain('docs/k.txt'); expect(j.royxat[1].parcha).toBeUndefined();
  });
});

describe('taqdim API', () => {
  it('yaratish: aktor sessiyadan, operation_id majburiy, nishon turi toza', async () => {
    const c = rpcMock({ t2_hm_taqdim_yarat_v1: { ok: true, id: 3, fayl_soni: 1 } }); const env = ENV(r2().bucket);
    const so = async (b: unknown) => amal({ request: new Request('https://x/api/hujjat-maydoni', { method: 'POST', headers: { Cookie: await kuki() }, body: JSON.stringify(b) }), env } as never);
    expect((await so({ amal: 'taqdim', nishon_turi: 'fayl', nishon_id: 4, aloqa_id: 2 })).status).toBe(400);
    const r = await so({ amal: 'taqdim', actor_id: 999, nishon_turi: 'papka', nishon_id: 4, aloqa_id: 2, izoh: 'x', operation_id: UUID });
    expect((await r.json() as any).id).toBe(3);
    expect(c[0].args).toMatchObject({ p_actor: 5, p_nishon_turi: 'papka', p_nishon_id: 4, p_aloqa_id: 2, p_operation_id: UUID });
    rpcMock({ t2_hm_taqdim_yarat_v1: { ok: false, code: 'TAQDIM_SHAXSIY' } });
    expect((await so({ amal: 'taqdim', nishon_turi: 'fayl', nishon_id: 4, aloqa_id: 2, operation_id: UUID })).status).toBe(400);
  });
  it('ro‘yxat/tafsilot/qaytarish: RPC ga aktor bilan; royxat kompaniyasiz 400', async () => {
    const c = rpcMock({ t2_hm_taqdim_royxat_v1: { ok: true, royxat: [] }, t2_hm_taqdim_tafsilot_v1: { ok: true }, t2_hm_taqdim_qaytar_v1: { ok: true } }); const env = ENV(r2().bucket);
    const g = async (q: string) => oqi({ request: new Request('https://x/api/hujjat-maydoni?' + q, { headers: { Cookie: await kuki() } }), env } as never);
    expect((await g('amal=taqdim_royxat')).status).toBe(400);
    await g('amal=taqdim_royxat&kompaniya_id=17&yonalish=yuborilgan'); await g('amal=taqdim_tafsilot&taqdim_id=3');
    await amal({ request: new Request('https://x/api/hujjat-maydoni', { method: 'POST', headers: { Cookie: await kuki() }, body: JSON.stringify({ amal: 'taqdim_qaytar', taqdim_id: 3, sabab: 'xato' }) }), env } as never);
    expect(c.map((x) => x.nom)).toEqual(['t2_hm_taqdim_royxat_v1', 't2_hm_taqdim_tafsilot_v1', 't2_hm_taqdim_qaytar_v1']);
    expect(c[0].args).toMatchObject({ p_actor: 5, p_kompaniya: 17, p_yonalish: 'yuborilgan' });
    expect(c[2].args).toMatchObject({ p_actor: 5, p_taqdim_id: 3, p_sabab: 'xato' });
  });
  it('taqdim faylini yuklab olish: RPC ruxsatidan keyin R2; ruxsat yo‘q = 404, R2 ga tegilmaydi', async () => {
    const s = r2(); s.objs.set('docs/17/0/0/f1/r1', new TextEncoder().encode('abc'));
    rpcMock({ t2_hm_taqdim_yuklab_v1: { ok: true, kalit: 'docs/17/0/0/f1/r1', nom: 'a.pdf', mime: 'application/pdf', bayt: 3, sha256: 'x' } });
    const url = 'https://x/api/hujjat-maydoni-ol?taqdim=3&el=8';
    const ok = await ol({ request: new Request(url, { headers: { Cookie: await kuki() } }), env: ENV(s.bucket) } as never);
    expect(ok.status).toBe(200); expect(ok.headers.get('Content-Disposition')).toMatch(/attachment/);
    rpcMock({ t2_hm_taqdim_yuklab_v1: { ok: false, code: 'TAQDIM_TOPILMADI' } }); s.raw.get.mockClear();
    expect((await ol({ request: new Request(url, { headers: { Cookie: await kuki() } }), env: ENV(s.bucket) } as never)).status).toBe(404);
    expect(s.raw.get).not.toHaveBeenCalled();
  });
});

beforeEach(() => vi.clearAllMocks());
