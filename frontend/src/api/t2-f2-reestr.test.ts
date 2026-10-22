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
    api.links.mockResolvedValueOnce({ ok: false });
    await expect(f2ReestrOl(900001)).rejects.toThrow('SHARTNOMA_BOGLANISHLARI_OQILMADI');
  });
  it('main table first, sources behind it; inactive object named from the act; file name from the act snapshot', async () => {
    api.read.mockImplementation(async ({ jadval, filtr }) => {
      if (jadval === 't2_akt_reestr') return { ok: true, toliq: true, qatorlar: [
        { id: 293, obyekt_id: 900001, obyekt: 'SYNTHETIC', oy: '2026-06-01', holat: 'tasdiqlangan', lifecycle_status: 'approved', hujjat_jami: 100 },
        { id: 50, obyekt_id: 79, obyekt: 'Fast Food 1-etaj', oy: '2026-05-01', holat: 'tasdiqlangan', lifecycle_status: 'approved', hujjat_jami: 7 },
        { id: 300, obyekt_id: 900001, obyekt: 'SYNTHETIC', oy: '2026-09-01', holat: 'qoralama', lifecycle_status: 'draft', hujjat_jami: 10 }] };
      if (filtr === 'akt_id=eq.293') return { ok: true, qatorlar: [{ raw_snapshot: { import_job_id: 31, hujjat_id: 325, manba: 'f2_v3', fayl: 'YEVROPA.xlsx' } }] };
      if (filtr === 'akt_id=eq.50') return { ok: true, qatorlar: [{ raw_snapshot: { manba: 'f2_v3' } }] };
      return { ok: true, qatorlar: [{ raw_snapshot: null }] };
    });
    const qisman: Array<{ tayyor?: boolean; manbalar: unknown[]; nom?: string | null }> = [];
    const r = await f2ReestrOl(900001, q => qisman.push({ tayyor: q.tayyor, manbalar: q.aktlar.map(a => a.manba), nom: q.aktlar.find(a => a.id === 50)?.obyekt_nom }));
    expect(qisman[0]).toEqual({ tayyor: false, manbalar: [null, null, null], nom: 'Fast Food 1-etaj' });
    expect(r.tayyor).toBe(true);
    expect(r.aktlar.map(a => [a.id, a.manba])).toEqual([[293, 'import'], [50, 'import'], [300, 'tizim']]);
    expect(r.faylNomlari.get(325)).toBe('YEVROPA.xlsx');
    expect([...(r.shartnomaOqilgan ?? [])]).toEqual([900001]);
  });
});
