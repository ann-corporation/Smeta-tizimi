// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { diskArxivla, diskHolatiMatni, diskOperationId, diskYoz } from './disk-yoz';
import { f2Manba, forma3Manba, obyektHujjatManba, shartnomaHujjatManba } from '../../src/lib/disk-hujjat';

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
const base = { actorId: 7, kompaniyaId: 17, obyektId: 80, turi: 'f2_hujjat', faylNomi: 'F-2 №5.xlsx', bytes, davr: '2026-11', xesh: 'abc', manba };

describe('Disk A2 - manba yordamchilari (kalit yagona manbadan)', () => {
  it('F-2: f2:<akt_id>, nom «F-2 №5 — Fast Food 1-qavat — 2026-11»', () => {
    expect(manba).toMatchObject({ turi: 'f2', id: 41, kalit: 'f2:41', nom: 'F-2 №5 — Fast Food 1-qavat — 2026-11' });
  });
  it('F-3: f3:<forma3_id>; shartnoma darajasidagi oylik paket shartnomaga bog‘liq kalit (obyektlar orasida to‘qnashmaydi)', () => {
    expect(forma3Manba({ forma3Id: 9, shartnomaId: 5, raqam: 2, shartnomaRaqam: '15-A', davr: '2026-08-31' }).kalit).toBe('f3:9');
    expect(shartnomaHujjatManba({ tur: 'shartnoma_oylik_paket', shartnomaId: 5, shartnomaRaqam: '15-A', oy: '2026-11' })).toMatchObject({ kalit: 'shartnoma_oylik_paket:s5:2026-11', shartnomaId: 5, nom: 'Oylik paket — shartnoma №15-A — 2026-11' });
    expect(shartnomaHujjatManba({ tur: 'shartnoma_oylik_paket', shartnomaId: 6, shartnomaRaqam: null, oy: '2026-11' }).kalit).not.toBe('shartnoma_oylik_paket:s5:2026-11');
  });
  it('slichitelniy/sverka/aosr: obyekt darajasi, bitta fayl (oysiz) - qayta yasalsa yangi versiya', () => {
    expect(obyektHujjatManba({ tur: 'slichitelniy', obyektId: 80, obyekt: 'Karting', oy: null })).toMatchObject({ kalit: 'slichitelniy:80:-', nom: 'Slichitelniy — Karting' });
    expect(obyektHujjatManba({ tur: 'sverka_lrv_res', obyektId: 80, obyekt: 'Karting', oy: null }).kalit).toBe('sverka_lrv_res:80:-');
  });
});

describe('diskYoz - yagona yozuvchi t2_disk_tizim_yoz_v1', () => {
  it('kalit/manba/nom RPC ga aynan o‘tadi; natija: yangi/versiya/takror', async () => {
    const c = rpcMock({ t2_disk_tizim_yoz_v1: { ok: true, fayl_id: 3, raqam: 2, yangi: false } });
    const r = await diskYoz(env(), { actorId: 7, kompaniyaId: 17, registryId: 9, manba });
    expect(r).toEqual({ ok: true, faylId: 3, versiya: 2, takror: false, yangi: false });
    expect(c).toHaveLength(1);
    expect(c[0].args).toMatchObject({ p_actor: 7, p_kompaniya: 17, p_registry_id: 9, p_manba_turi: 'f2', p_manba_id: 41, p_hujjat_kalit: 'f2:41', p_nom: 'F-2 №5 — Fast Food 1-qavat — 2026-11' });
  });
  it('manba berilmasa kalit/nom NULL: SQL registry qatoridan aniqlaydi (kalitni mijoz o‘ylab topmaydi)', async () => {
    const c = rpcMock({});
    await diskYoz(env(), { actorId: 7, kompaniyaId: 17, registryId: 9 });
    expect(c[0].args).toMatchObject({ p_manba_turi: null, p_manba_id: null, p_hujjat_kalit: null, p_nom: null, p_shartnoma_id: null });
  });
  it('xato JIM YUTILMAYDI: jurnalga yoziladi va natijada qaytadi; hech qachon istisno tashlamaydi', async () => {
    const jurnal = vi.spyOn(console, 'error').mockImplementation(() => {});
    rpcMock({ t2_disk_tizim_yoz_v1: { ok: false, code: 'KVOTA_TUGADI' } });
    expect(await diskYoz(env(), { actorId: 7, kompaniyaId: 17, registryId: 9, manba })).toEqual({ ok: false, code: 'KVOTA_TUGADI' });
    expect(jurnal).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(jurnal.mock.calls[0][0]))).toMatchObject({ disk: 'yoz_xato', kompaniya_id: 17, registry_id: 9, kalit: 'f2:41', code: 'KVOTA_TUGADI' });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('tarmoq'); }));
    expect(await diskYoz(env(), { actorId: 7, kompaniyaId: 17, registryId: 9 })).toMatchObject({ ok: false });
    expect(jurnal).toHaveBeenCalledTimes(2);
    jurnal.mockRestore();
  });
});

describe('diskArxivla (server yasagan hujjat)', () => {
  it('yangi hujjat: reserve -> R2 -> finalize -> t2_disk_tizim_yoz_v1; operation_id deterministik', async () => {
    const c = rpcMock({ t2_document_canonical_reserve_v1: { ok: true, document_id: 9, r2_key: 'docs/17/_/80/d9/r1', canonical_storage_status: 'reserved' }, t2_disk_tizim_yoz_v1: { ok: true, fayl_id: 4, raqam: 1, yangi: true } });
    const s = r2();
    const r = await diskArxivla(env(s.bucket), base);
    expect(r).toEqual({ ok: true, documentId: 9, disk: { ok: true, faylId: 4, versiya: 1, takror: false, yangi: true } });
    expect(c.map((x) => x.nom)).toEqual(['t2_document_canonical_reserve_v1', 't2_document_canonical_finalize_v1', 't2_disk_tizim_yoz_v1']);
    expect(s.put).toHaveBeenCalledWith('docs/17/_/80/d9/r1', bytes, expect.anything());
    expect(c[2].args).toMatchObject({ p_registry_id: 9, p_hujjat_kalit: 'f2:41', p_manba_id: 41 });
    expect(c[0].args).toMatchObject({ p_document_type: 'f2_hujjat', p_obyekt_id: 80, p_revision: '2026-11', p_operation_id: await diskOperationId(17, 80, 'f2_hujjat', 'f2:41', 'abc') });
  });
  it('bir xil mazmun qayta yasalsa: R2 ga qayta yozilmaydi (stored), Disk yozuvchisi takror deydi - versiya qo‘shilmaydi', async () => {
    const c = rpcMock({ t2_document_canonical_reserve_v1: { ok: true, document_id: 9, canonical_storage_status: 'stored', retry: true }, t2_disk_tizim_yoz_v1: { ok: true, takror: true, fayl_id: 4 } });
    const s = r2();
    const r = await diskArxivla(env(s.bucket), base);
    expect(r).toMatchObject({ ok: true, documentId: 9, disk: { ok: true, takror: true } });
    expect(s.put).not.toHaveBeenCalled();
    expect(c.map((x) => x.nom)).toEqual(['t2_document_canonical_reserve_v1', 't2_disk_tizim_yoz_v1']);
  });
  it('mazmun o‘zgarsa (tahrir) operation_id o‘zgaradi => yangi registry yozuvi => yangi VERSIYA; kalit o‘sha', async () => {
    const a = await diskOperationId(17, 80, 'f2_hujjat', 'f2:41', 'abc'); const b = await diskOperationId(17, 80, 'f2_hujjat', 'f2:41', 'xyz');
    expect(a).not.toBe(b); expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(await diskOperationId(17, 80, 'f2_hujjat', 'f2:41', 'abc')).toBe(a);
  });
  it('xatolar hujjat berishni buzmaydi, lekin jurnalga yoziladi: R2 yo‘q/xato, reserve rad, noma’lum tur', async () => {
    const jurnal = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await diskArxivla(env(undefined), base)).toEqual({ ok: false, code: 'CONFIG' });
    rpcMock({ t2_document_canonical_reserve_v1: { ok: false, code: 'STORAGE_TENANT_MISMATCH' } });
    expect(await diskArxivla(env(r2().bucket), base)).toEqual({ ok: false, code: 'STORAGE_TENANT_MISMATCH' });
    rpcMock({ t2_document_canonical_reserve_v1: { ok: true, document_id: 9, r2_key: 'k', canonical_storage_status: 'reserved' } });
    const s = r2(); s.put.mockRejectedValueOnce(new Error('r2'));
    expect(await diskArxivla(env(s.bucket), base)).toEqual({ ok: false, code: 'R2_XATO' });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('tarmoq'); }));
    expect((await diskArxivla(env(r2().bucket), base)).ok).toBe(false);
    expect(await diskArxivla(env(r2().bucket), { ...base, turi: 'noma’lum' })).toEqual({ ok: false, code: 'TUR_NOMALUM' });
    expect(jurnal.mock.calls.length).toBeGreaterThanOrEqual(5);
    jurnal.mockRestore();
  });
  it('Disk yozuvi yiqilsa (hujjat saqlangan): natijada ko‘rinadi (sarlavha xato:<kod>), hujjat o‘zi berilaveradi', async () => {
    const jurnal = vi.spyOn(console, 'error').mockImplementation(() => {});
    rpcMock({ t2_document_canonical_reserve_v1: { ok: true, document_id: 9, canonical_storage_status: 'stored' }, t2_disk_tizim_yoz_v1: { ok: false, code: 'KVOTA_TUGADI' } });
    const r = await diskArxivla(env(r2().bucket), base);
    expect(diskHolatiMatni(r)).toBe('xato:KVOTA_TUGADI');
    expect(diskHolatiMatni(null)).toBe('otkazildi');
    expect(diskHolatiMatni({ ok: true, documentId: 1, disk: { ok: true, faylId: 1, versiya: 1, takror: false, yangi: true } })).toBe('ok');
    jurnal.mockRestore();
  });
});