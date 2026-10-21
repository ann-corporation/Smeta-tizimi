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
});
