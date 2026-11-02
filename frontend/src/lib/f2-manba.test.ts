import { describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ oqi: vi.fn() }));
vi.mock('../api/supabase', () => ({ sbOqi: m.oqi }));
import { f2ImportAktlari, f2ImportQilinganmi } from './f2-manba';

describe('F2 akt manbasi', () => {
  it('import qatori (raw_snapshot.manba=f2_v3) bo‘lsa — import; bo‘lmasa — tizimda tayyorlangan; natija keshlanadi', async () => {
    m.oqi.mockResolvedValueOnce({ ok: true, qatorlar: [{ id: 1 }] }).mockResolvedValueOnce({ ok: true, qatorlar: [] });
    expect(await f2ImportQilinganmi(10)).toBe(true);
    expect(await f2ImportQilinganmi(11)).toBe(false);
    expect(await f2ImportQilinganmi(10)).toBe(true);
    expect(m.oqi).toHaveBeenCalledTimes(2);
    expect(m.oqi.mock.calls[0][0].filtr).toContain('raw_snapshot->>manba=eq.f2_v3');
  });
  it('o‘qib bo‘lmasa xato beradi (tugma jim yashirilmaydi)', async () => {
    m.oqi.mockResolvedValueOnce({ ok: false });
    await expect(f2ImportQilinganmi(12)).rejects.toThrow('F2_MANBA_OQILMADI');
  });
  it('f2ImportAktlari: bir nechta akt uchun BITTA so‘rov (N+1 yo‘q), import qilinganlar to‘plami; natija keshlanadi', async () => {
    m.oqi.mockReset();
    m.oqi.mockResolvedValueOnce({ ok: true, qatorlar: [{ akt_id: 21 }, { akt_id: 21 }] });
    const s = await f2ImportAktlari([21, 22, 23]);
    expect([...s]).toEqual([21]);
    expect(m.oqi).toHaveBeenCalledTimes(1);
    expect(m.oqi.mock.calls[0][0].filtr).toContain('akt_id=in.(21,22,23)');
    expect(await f2ImportQilinganmi(22)).toBe(false);
    expect(await f2ImportQilinganmi(21)).toBe(true);
    expect(m.oqi).toHaveBeenCalledTimes(1);
  });
});
