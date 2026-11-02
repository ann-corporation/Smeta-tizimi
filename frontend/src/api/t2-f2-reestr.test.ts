import { beforeEach, describe, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ read: vi.fn(), objects: vi.fn(), contracts: vi.fn(), links: vi.fn(), projects: vi.fn(), docs: vi.fn() }));
vi.mock('./supabase', () => ({ sbOqi: api.read, sbT2ObyektlarOlKomp: api.objects }));
vi.mock('./t2-shartnoma', () => ({ sbT2ShartnomalarOl: api.contracts, sbT2ShartnomaBogOl: api.links }));
vi.mock('./t2-loyiha', () => ({ sbT2LoyihalarOl: api.projects }));
vi.mock('./t2-hujjat-canonical', () => ({ hujjatRoyxatOl: api.docs }));
import { f2ReestrOl } from './t2-f2-reestr';
beforeEach(() => {
  vi.resetAllMocks();
  api.objects.mockResolvedValue({ ok: true, qatorlar: [{ id: 900001, nom: 'SYNTHETIC', loyiha_id: null, jami: null, narxsiz: null }] });
  api.contracts.mockResolvedValue({ ok: true, qatorlar: [] });api.links.mockResolvedValue({ ok: true, qatorlar: [] });
  api.projects.mockResolvedValue({ ok: true, qatorlar: [] });api.docs.mockResolvedValue({ documents: [] });
  api.read.mockImplementation(async ({ jadval }) => jadval === 't2_akt_reestr'
    ? { ok: true, qatorlar: [{ id: 900002, obyekt_id: 900001, holat: 'qoralama', hujjat_jami: null }], toliq: true }
    : { ok: true, qatorlar: [] });
});
const jadvallar = () => api.read.mock.calls.map(c => c[0].jadval);
describe('F2 register read integrity', () => {
  it('preserves unknown act origin when there is no source row', async () => {
    const r = await f2ReestrOl(900001);
    expect(r.aktlar[0].manba).toBeNull();expect(r.aktlar[0].hujjat_jami).toBeNull();
    expect(api.read.mock.calls[0][0].filtr).toContain('kompaniya_id=eq.900001');
  });
  it('never computes a company total from a truncated act response', async () => {
    api.read.mockResolvedValueOnce({ ok: true, qatorlar: [], toliq: false, jamiServerda: 5001 });
    await expect(f2ReestrOl(900001)).rejects.toThrow('F2_OQILMADI');
  });
  it('contract read failure is not presented as no assigned contract', async () => {
    api.contracts.mockResolvedValueOnce({ ok: false, error: 'PERMISSION_DENIED' });
    await expect(f2ReestrOl(900001)).rejects.toThrow('PERMISSION_DENIED');
  });
  it('failed relationship lookup is not presented as an unbound object', async () => {
    api.read.mockImplementation(async ({ jadval }) => jadval === 't2_akt_reestr'
      ? { ok: true, qatorlar: [], toliq: true } : jadval === 't2_shartnoma_bog_kompaniya' ? { ok: false, error: 'NO_VIEW' } : { ok: true, qatorlar: [] });
    api.links.mockResolvedValueOnce({ ok: false });
    await expect(f2ReestrOl(900001)).rejects.toThrow('SHARTNOMA_BOGLANISHLARI_OQILMADI');
  });

});
describe('F2 register query count (no N+1)', () => {
  const N = 27, M = 41;
  const obyektlar = Array.from({ length: N }, (_, i) => ({ id: 1000 + i, nom: 'O' + i, loyiha_id: null, jami: null, narxsiz: null }));
  const aktlar = (yangi: boolean) => Array.from({ length: M }, (_, i) => ({ id: 5000 + i, obyekt_id: 1000 + (i % N), holat: 'qoralama', hujjat_jami: 1,
    ...(yangi ? { manba_bor: true, manba: i % 2 ? 'f2_v3' : null, import_job_id: i % 2 ? 7 : null, hujjat_id: i % 2 ? 9 : null } : {}) }));
  it('new columns + company-wide bog view: 6 parallel reads, no per-object/per-act requests', async () => {
    api.objects.mockResolvedValue({ ok: true, qatorlar: obyektlar });
    api.contracts.mockResolvedValue({ ok: true, qatorlar: [{ id: 1, raqam: 'S1', nom: null, jami_nds_bilan: 1, summa_bez_nds: 1 }] });
    api.read.mockImplementation(async ({ jadval }) => jadval === 't2_akt_reestr' ? { ok: true, qatorlar: aktlar(true), toliq: true }
      : jadval === 't2_shartnoma_bog_kompaniya' ? { ok: true, qatorlar: [{ id: 1, obyekt_id: 1003, shartnoma_id: 1, holat: 'faol' }], toliq: true } : { ok: true, qatorlar: [] });
    const r = await f2ReestrOl(17);
    expect(api.read).toHaveBeenCalledTimes(2); expect(api.links).not.toHaveBeenCalled();
    expect(jadvallar()).not.toContain('t2_akt_qator');
    expect(r.shartnomalar.get(1003)?.[0].id).toBe(1); expect(r.shartnomalar.size).toBe(1);
    expect(r.aktlar[1]).toMatchObject({ manba: 'import', import_job_id: 7, hujjat_id: 9 }); expect(r.aktlar[0].manba).toBe('tizim');
  });
  it('fallback (migration not applied): old per-object and per-act path still works', async () => {
    api.objects.mockResolvedValue({ ok: true, qatorlar: obyektlar });
    api.read.mockImplementation(async ({ jadval }) => jadval === 't2_akt_reestr' ? { ok: true, qatorlar: aktlar(false), toliq: true }
      : jadval === 't2_shartnoma_bog_kompaniya' ? { ok: false, error: 'POLICY' } : jadval === 't2_akt_qator' ? { ok: true, qatorlar: [{ raw_snapshot: { import_job_id: 3 } }] } : { ok: true, qatorlar: [] });
    const r = await f2ReestrOl(17);
    expect(api.links).toHaveBeenCalledTimes(N); expect(jadvallar().filter(j => j === 't2_akt_qator')).toHaveLength(M);
    expect(r.aktlar[0].manba).toBe('import');
  });
});