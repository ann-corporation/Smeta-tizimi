/**
 * Audit C (2026-11-06) — o'qish qatlami, SINTETIK: B2 eski versiya qatorlari tarixdan, B4/B5 noyob tartib va to'liqlik,
 * m2 reestr to'liqligi, M1 akt qatorlari noyob kalit bilan. Tarmoq yo'q — `sbOqi` mock.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SbSoro } from './supabase';

const m = vi.hoisted(() => ({ sbOqi: vi.fn() }));
vi.mock('./supabase', () => ({ sbOqi: m.sbOqi, sbT2DaraxtOl: vi.fn(), ogirYuklashKut: vi.fn() }));
vi.mock('./t2-akt-podval', () => ({ aktPodvallariniOl: vi.fn() }));
vi.mock('./t2-nakopitelniy', () => ({ shartnomaSvodOl: vi.fn() }));
vi.mock('./f2-hujjat-kontekst', () => ({ f2HujjatKonteksti: vi.fn() }));
import { aktQatorlariOl, smetaTarixBilan } from './f2-oylik-paket';
import { sbT2F2TafsilotOl } from './t2-narx';
import { f2AktKirish } from '../lib/f2-akt-hujjat';
import type { T2Qator } from './supabase';
import type { F2Tafsilot } from './t2-narx';

const q = (o: Partial<T2Qator> & { id: number; tur: string }): T2Qator => ({ obyekt_id: 8, ota_id: null, tartib: o.id, nom: `q${o.id}`, kat: null, kod: null, birlik: null, ...o } as T2Qator);

beforeEach(() => { m.sbOqi.mockReset(); });

describe('B2: eski smeta versiyasidagi F2 qatorlari tarixdan o‘qiladi', () => {
  // Faol: razdel 1. Eski versiya: ish 20 (razdel 10 ostida, u ham eski), resurs 21; ish 20 ning yana bolasi 22 (aktda yo'q).
  const ESKI: Record<number, T2Qator> = {
    10: q({ id: 10, tur: 'rz', nom: 'ЭСКИ РАЗДЕЛ' }), 20: q({ id: 20, tur: 'bl', ota_id: 10 }),
    21: q({ id: 21, tur: 'rs', ota_id: 20, kat: 'ЧЕЛ' }), 22: q({ id: 22, tur: 'rs', ota_id: 20, kat: 'МАШ' }),
  };
  it('id bo‘yicha (versiya: tarix), ota zanjiri va eski ish bolalari bilan; hujjatda topilmagan 0', async () => {
    m.sbOqi.mockImplementation(async (s: SbSoro) => {
      expect(s.jadval).toBe('t2_qator');
      expect(s.versiya).toBe('tarix');
      const ids = /id=in\.\(([^)]*)\)/.exec(s.filtr ?? '')?.[1]?.split(',').map(Number) ?? [];
      if ((s.filtr ?? '').includes('ota_id=in.')) return { ok: true, toliq: true, qatorlar: Object.values(ESKI).filter((r) => ids.includes(r.ota_id as number)) };
      return { ok: true, toliq: true, qatorlar: ids.map((i) => ESKI[i]).filter(Boolean) };
    });
    const faol = [q({ id: 1, tur: 'rz' })];
    const smeta = await smetaTarixBilan(8, faol, [21, 20]);
    expect(smeta.map((r) => r.id).sort((a, b) => a - b)).toEqual([1, 10, 20, 21, 22]);
    const lines = [20, 21].map((id, i) => ({ akt_id: 1, akt_qator_id: i + 1, qator_id: id, hajm: 1, narx: id === 21 ? 10 : null, summa: id === 21 ? 10 : null, certified_quantity: 1, certified_amount: id === 21 ? 10 : null, certified_unit_price: id === 21 ? 10 : null } as F2Tafsilot));
    expect(f2AktKirish(faol, lines).topilmagan).toBe(2); // faqat faol daraxt — eski qatorlar yo'qolardi
    const k = f2AktKirish(smeta, lines);
    expect(k.topilmagan).toBe(0);
    expect(k.qatorlar.map((x) => x.id).sort()).toEqual([20, 21]);
  });
  it('tarix o‘qilmasa yoki to‘liq bo‘lmasa — throw (yarim hujjat yo‘q)', async () => {
    m.sbOqi.mockResolvedValue({ ok: true, toliq: false, qatorlar: [] });
    await expect(smetaTarixBilan(8, [], [5])).rejects.toThrow('SMETA_TARIX_OQILMADI');
  });
  it('hammasi faol daraxtda — so‘rov yo‘q', async () => {
    await smetaTarixBilan(8, [q({ id: 5, tur: 'mat' })], [5]);
    expect(m.sbOqi).not.toHaveBeenCalled();
  });
});

describe('B4/B5: F2 tafsilot — noyob tartib, akt filtri, to‘liq emas = xato', () => {
  it('tartib akt_qator_id.asc, aktId filtri', async () => {
    m.sbOqi.mockResolvedValue({ ok: true, toliq: true, qatorlar: [] });
    await sbT2F2TafsilotOl({ obyektId: 8, tur: 'f2', aktId: 77 });
    const s = m.sbOqi.mock.calls[0][0] as SbSoro;
    expect(s.tartib).toBe('akt_qator_id.asc');
    expect(s.filtr).toContain('akt_id=eq.77');
  });
  it('toliq: false — ok: false (ko‘rinadigan xato)', async () => {
    m.sbOqi.mockResolvedValue({ ok: true, toliq: false, qatorlar: [{ akt_qator_id: 1 }] });
    const r = await sbT2F2TafsilotOl({ obyektId: 8, tur: 'f2' });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('TOLIQ_EMAS');
    expect(r.qatorlar).toEqual([]);
  });
});

describe('M1: t2_akt_qator — noyob kalit (id) bilan to‘liq o‘qish', () => {
  it('id.asc keyset; takror/tartibsiz kalit — throw', async () => {
    m.sbOqi.mockResolvedValueOnce({ ok: true, toliq: true, jamiServerda: 2, qatorlar: [{ id: 1, akt_id: 5, qator_id: 9 }, { id: 2, akt_id: 5, qator_id: 10 }] });
    const r = await aktQatorlariOl(8, [5]);
    expect(r.get(5)?.length).toBe(2);
    expect((m.sbOqi.mock.calls[0][0] as SbSoro).tartib).toBe('id.asc');
    m.sbOqi.mockResolvedValueOnce({ ok: true, toliq: true, qatorlar: [{ id: 2, akt_id: 5 }, { id: 2, akt_id: 5 }] });
    await expect(aktQatorlariOl(8, [5])).rejects.toThrow('AKT_QATOR_OQILMADI');
  });
});
