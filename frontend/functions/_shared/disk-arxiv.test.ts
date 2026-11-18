// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { diskArxivla, diskOperationId } from './disk-arxiv';
import { f2Manba, forma3Manba, obyektHujjatManba } from '../../src/lib/disk-hujjat';

afterEach(() => vi.unstubAllGlobals());

function rpcMock(j: Record<string, unknown>) {
  const c: Array<{ nom: string; args: any }> = [];
  vi.stubGlobal('fetch', vi.fn(async (u: string, init?: RequestInit) => {
    const nom = String(u).split('/rpc/')[1]; c.push({ nom, args: JSON.parse(String(init?.body ?? '{}')) });
    return Response.json((j[nom] as object) ?? { ok: true });
  }));
  return c;
}
const r2 = () => { const put = vi.fn(async () => ({})); return { put, bucket: { put, get: vi.fn(), head: vi.fn(), delete: vi.fn() } as unknown as R2Bucket }; };
const env = (bucket?: R2Bucket) => ({ SUPABASE_URL: 'https://a.supabase.co', SUPABASE_KEY: 'k', R2_CANONICAL: bucket });
const manba = f2Manba({ aktId: 41, raqam: '5', obyekt: 'Fast Food 1-qavat', oy: '2026-11-01' });
const bytes = new Uint8Array([1, 2, 3, 4]);
const base = { actorId: 7, kompaniyaId: 17, obyektId: 80, turi: 'f2', faylNomi: 'F-2 №5.xlsx', bytes, davr: '2026-11', xesh: 'abc', manba };

describe('Disk helper: kalit, manba va aniq nom', () => {
  it('F-2: nom = «F-2 №5 — Fast Food 1-qavat — 2026-11», kalit akt bo‘yicha barqaror (oyga bog‘liq emas)', () => {
    expect(manba).toMatchObject({ turi: 'f2', id: 41, kalit: 'f2:41', nom: 'F-2 №5 — Fast Food 1-qavat — 2026-11' });
    expect(f2Manba({ aktId: 41, raqam: null, obyekt: null, oy: null }).nom).toBe('F-2 №41');
  });
  it('oylik hujjatlar kaliti backfill bilan bir xil: <tur>:<obyekt>:<oy|->', () => {
    expect(obyektHujjatManba({ tur: 'nakopitelniy', obyektId: 80, obyekt: 'Karting', oy: '2026-08' })).toMatchObject({ kalit: 'nakopitelniy:80:2026-08', nom: 'Nakopitelniy — Karting — 2026-08' });
    expect(obyektHujjatManba({ tur: 'slichitelniy', obyektId: 80, obyekt: 'Karting', oy: null }).kalit).toBe('slichitelniy:80:-');
  });
  it('Forma 3: kalit obyekt + oy (mijoz va server bir xil), shartnoma raqami nomda', () => {
    const m = forma3Manba({ obyektId: 80, shartnomaId: 5, f3Id: 9, raqam: 2, obyekt: 'Karting', davr: '2026-08-15', shartnomaRaqam: '15-A' });
    expect(m).toMatchObject({ turi: 'forma3', id: 9, kalit: 'f3:80:2026-08', shartnomaId: 5 });
    expect(m.nom).toBe('Forma № 3 №2 — Karting — 2026-08 — shartnoma №15-A');
    expect(forma3Manba({ obyektId: 80, shartnomaId: null, f3Id: null, raqam: null, obyekt: 'K', davr: null }).kalit).toBe('f3:80:-');
  });
});

describe('diskArxivla (server avtoarxiv)', () => {
  it('yangi hujjat: reserve -> R2 -> finalize -> meta (kalit/manba/nom); operation_id deterministik', async () => {
    const c = rpcMock({ t2_document_canonical_reserve_v1: { ok: true, document_id: 9, r2_key: 'docs/17/_/80/d9/r1', canonical_storage_status: 'reserved' }, t2_disk_tizim_meta_v1: { ok: true, versiya: 1 } });
    const s = r2();
    const r = await diskArxivla(env(s.bucket), base);
    expect(r).toEqual({ ok: true, documentId: 9, versiya: 1, takror: false });
    expect(c.map((x) => x.nom)).toEqual(['t2_document_canonical_reserve_v1', 't2_document_canonical_finalize_v1', 't2_disk_tizim_meta_v1']);
    expect(s.put).toHaveBeenCalledWith('docs/17/_/80/d9/r1', bytes, expect.anything());
    const meta = c[2].args;
    expect(meta).toMatchObject({ p_actor_id: 7, p_kompaniya_id: 17, p_document_id: 9, p_manba_turi: 'f2', p_manba_id: 41, p_hujjat_kalit: 'f2:41', p_nom: 'F-2 №5 — Fast Food 1-qavat — 2026-11' });
    expect(c[0].args).toMatchObject({ p_document_type: 'f2_hujjat', p_obyekt_id: 80, p_revision: '2026-11', p_operation_id: await diskOperationId(17, 80, 'f2_hujjat', 'f2:41', 'abc') });
    expect(c[0].args.p_client_sha256).toMatch(/^[0-9a-f]{64}$/);
  });
  it('bir xil mazmun qayta yasalsa: mavjud (stored) yozuv - R2 ga qayta yozilmaydi, versiya qo‘shilmaydi', async () => {
    const c = rpcMock({ t2_document_canonical_reserve_v1: { ok: true, document_id: 9, canonical_storage_status: 'stored', retry: true, dedup: true }, t2_disk_tizim_meta_v1: { ok: true, versiya: 2 } });
    const s = r2();
    const r = await diskArxivla(env(s.bucket), base);
    expect(r).toMatchObject({ ok: true, takror: true, documentId: 9 });
    expect(s.put).not.toHaveBeenCalled();
    expect(c.map((x) => x.nom)).toEqual(['t2_document_canonical_reserve_v1', 't2_disk_tizim_meta_v1']);
  });
  it('mazmun o‘zgarsa operation_id o‘zgaradi (yangi versiya), kalit o‘sha', async () => {
    const a = await diskOperationId(17, 80, 'f2_hujjat', 'f2:41', 'abc'); const b = await diskOperationId(17, 80, 'f2_hujjat', 'f2:41', 'xyz');
    expect(a).not.toBe(b); expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(await diskOperationId(17, 80, 'f2_hujjat', 'f2:41', 'abc')).toBe(a);
  });
  it('xatolar hujjat berishni buzmaydi: R2 yoq/xato, reserve rad - ok:false, istisno yo‘q', async () => {
    expect(await diskArxivla(env(undefined), base)).toEqual({ ok: false, code: 'CONFIG' });
    rpcMock({ t2_document_canonical_reserve_v1: { ok: false, code: 'STORAGE_TENANT_MISMATCH' } });
    expect(await diskArxivla(env(r2().bucket), base)).toEqual({ ok: false, code: 'STORAGE_TENANT_MISMATCH' });
    rpcMock({ t2_document_canonical_reserve_v1: { ok: true, document_id: 9, r2_key: 'k', canonical_storage_status: 'reserved' } });
    const s = r2(); s.put.mockRejectedValueOnce(new Error('r2'));
    expect(await diskArxivla(env(s.bucket), base)).toEqual({ ok: false, code: 'R2_XATO' });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('tarmoq'); }));
    expect((await diskArxivla(env(r2().bucket), base)).ok).toBe(false);
    expect(await diskArxivla(env(r2().bucket), { ...base, turi: 'noma’lum' })).toEqual({ ok: false, code: 'TUR_NOMALUM' });
  });
});
