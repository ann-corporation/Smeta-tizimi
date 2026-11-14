import { describe, expect, it } from 'vitest';
import type { T2Qator, T2QatorHolat } from '../api/supabase';
import { slichitelniyModeli, QOSHIMCHA_BOLIM_NOMI } from './slichitelniy-vedomost';
import { slichitelniyTsiklYuki } from './slichitelniy-tsikl';
import { pereraschetYagona } from './pereraschet-yagona';

/* Sintetik. Pereraschet = slichitelniy modeli (fakt F-2 narxida − tasdiqlangan F-2): bitta hisob, bitta son. */
function q(id: number, ota: number | null, tur: string, hajm: number | null, nom: string, ex: Partial<T2Qator> = {}): T2Qator {
  return { id, obyekt_id: 1, obyekt: 'X', kompaniya_id: 1, ota_id: ota, daraja: 0, tartib: id, tur, kod: 'К' + id, nom, birlik: 'м3', hajm, narx: 1000, summa: null,
    kat: tur === 'rz' || tur === 'bl' ? null : 'МАТ', narx_usul: null, qoshimcha: false, zamena: false, d1: null, d2: null, d3: null, xom_qator: id, yangilandi: null,
    manba_id: null, versiya: 1, raqam: null, norma: null, ...ex } as T2Qator;
}
const h = (id: number, fakt: number | null, f2h: number, f2s: number | null): T2QatorHolat =>
  ({ id, qator_id: id, obyekt_id: 1, tur: null, kod: null, nom: null, birlik: null, kat: null, smeta_hajm: null, smeta_summa: null, fakt_hajm: fakt, fakt_summa: 0,
    f2_hajm: f2h, f2_summa: f2s, qoldiq_hajm: null, qoldiq_summa: null }) as unknown as T2QatorHolat;

const ROWS = [
  q(1, null, 'rz', null, 'РАЗДЕЛ А'), q(2, 1, 'bl', 10, 'ИШ А'),
  q(3, 2, 'mat', 10, 'ДОПЛАТА'),          // fakt 8, F-2 5 → +3000
  q(4, 2, 'mat', 10, 'FAKT YO‘Q'),   // fakt 0, F-2 7 → −7000 (eski hisob buni umuman ko'rmagan)
  q(5, 2, 'mat', 10, 'ТЕНГ'),             // 6 = 6
  q(6, 2, 'mat', 10, 'F2 SMETADAN ORTIQ'),// fakt 12 < F-2 15 → −3000
  q(7, 2, 'mat', 10, 'FAKT SMETADAN ORTIQ'), // fakt 14 > smeta 10, F-2 10 → +4000
  q(8, 2, 'mat', 10, 'NARXSIZ F2'),       // fakt 3, F-2 hajmi 3, summa NULL → noma'lum
  q(9, null, 'rz', null, 'РАЗДЕЛ Б'), q(10, 9, 'bl', 5, 'ИШ Б'),
  q(11, 10, 'rs', 5, 'ЧЕЛ', { kat: 'ЧЕЛ' }), // fakt 5, F-2 2 → +3000
  q(12, null, 'rz', null, 'ДОП'), q(13, 12, 'mat', null, 'QO‘SHIMCHA', { qoshimcha: true }), // smetada yo'q: fakt 2, F-2 0 → +2000
];
const HOLAT = [h(3, 8, 5, 5000), h(4, 0, 7, 7000), h(5, 6, 6, 6000), h(6, 12, 15, 15_000), h(7, 14, 10, 10_000), h(8, 3, 3, null), h(11, 5, 2, 2000), h(13, 2, 0, 0)];

describe('pereraschet — yagona hisob (slichitelniy modeli)', () => {
  const m = slichitelniyModeli(ROWS, HOLAT);
  const n = pereraschetYagona(ROWS, HOLAT);

  it('jami plus/minus/sof slichitelniy hujjatidagi pereraschet bilan AYNAN teng', () => {
    expect(n.jami.plus).toBe(m.pereraschet.doplata);
    expect(n.jami.minus).toBe(-m.pereraschet.snyatie);
    expect(n.jami.sof).toBe(m.pereraschet.net);
    expect(n.jami.plus).toBe(12_000);
    expect(n.jami.minus).toBe(10_000);
  });
  it('fakt < F-2 (jumladan fakt 0) — к снятию: eski hisobda bu yo‘q edi', () => {
    const r = n.qatorlar.find((x) => x.qatorId === 4)!;
    expect(r.sof).toBe(-7000);
    expect(r.bandlar[0].tur).toBe('ortiqcha');
    expect(r.bandlar[0].hajm).toBe(-7);
  });
  it('smeta bilan cheklanmaydi: fakt smetadan ortiq — к доплате; qo‘shimcha ish ham pulga kiradi', () => {
    expect(n.qatorlar.find((x) => x.qatorId === 7)!.sof).toBe(4000);
    expect(n.qatorlar.find((x) => x.qatorId === 13)!.sof).toBe(2000);
  });
  it('F-2 summasi noma‘lum qator pulga kirmaydi (NULL ≠ 0), tekshirishda', () => {
    expect(n.hisobda.some((x) => x.qatorId === 8)).toBe(false);
    expect(n.tekshirish.some((x) => x.qatorId === 8)).toBe(true);
  });
  it('kesim (ustamali uchun) tsikl bilan bir xil; turBoyicha va bo‘limlar jamiga teng', () => {
    const y = slichitelniyTsiklYuki(m);
    expect(n.plusKesim).toEqual(y.plusKesim);
    expect(n.minusKesim).toEqual(y.minusKesim);
    const t = Object.values(n.turBoyicha);
    expect(t.reduce((s, x) => s + x.plus, 0)).toBe(n.jami.plus);
    expect(t.reduce((s, x) => s + x.minus, 0)).toBe(n.jami.minus);
    expect(n.bolimlar.reduce((s, b) => s + b.sof, 0)).toBe(n.jami.sof);
    expect(n.bolimlar.map((b) => b.yol.join('>')).sort()).toEqual([QOSHIMCHA_BOLIM_NOMI, 'РАЗДЕЛ А', 'РАЗДЕЛ Б']);
  });
  it('bo‘lim filtri: faqat shu bo‘lim ostidagi qatorlar', () => {
    const b = pereraschetYagona(ROWS, HOLAT, { bolimId: 9 });
    expect(b.jami.plus).toBe(3000);
    expect(b.jami.minus).toBe(0);
    expect(b.qatorlar.map((x) => x.qatorId)).toEqual([11]);
  });
});

describe('Amfiteatr tipidagi chekka holatlar (sintetik)', () => {
  const hh = (id: number, p: Record<string, unknown>) => ({ ...h(id, 0, 0, 0), ...p }) as unknown as T2QatorHolat;
  it('smeta narxi yo‘q, lekin F-2 narxi ma‘lum: fakt F-2 narxida baholanadi (NULL emas) — server `fakt_summa` NULL bo‘lsa ham', () => {
    const rows = [q(1, null, 'rz', null, 'R'), q(2, 1, 'rs', 10, 'ВОДА', { narx: null })];
    const m = slichitelniyModeli(rows, [hh(2, { fakt_hajm: 4, f2_hajm: 2, f2_summa: 3000, f2_summa_yoq: 0, fakt_summa: null, fakt_manbasi: 'BL_NORMA' })]);
    const b = m.qatorlar.find((x) => x.id === 2)!;
    expect(b.faktSumma).toBe(6000);
    expect(b.doplataSumma).toBe(3000);
  });
  it('F-2 hajmi bor-u summasi yozilmagan (f2_summa_yoq): fakt summasi ham noma‘lum — pulga kirmaydi, tekshirishda', () => {
    const rows = [q(1, null, 'rz', null, 'R'), q(2, 1, 'rs', 10, 'ВОДА', { narx: null })];
    const n = pereraschetYagona(rows, [hh(2, { fakt_hajm: 4, f2_hajm: 4, f2_summa: 0, f2_summa_yoq: 1, f2_summa_nomalum: 1, fakt_summa: null })]);
    expect(n.jami.plus + n.jami.minus).toBe(0);
    expect(n.hisobda).toHaveLength(0);
  });
  it('ostida qatori yo‘q ish (bl) — barg sifatida: uning F-2 si jami F-2 ga kiradi (server paketi bilan bir xil qoida)', () => {
    const rows = [q(1, null, 'rz', null, 'R'), q(2, 1, 'bl', 150, 'ИШ ПУСТОЙ', { narx: null }), q(3, 1, 'bl', 5, 'ИШ'), q(4, 3, 'mat', 5, 'МАТ')];
    const m = slichitelniyModeli(rows, [hh(2, { fakt_hajm: 0, f2_hajm: 150, f2_summa: 2_310_300, f2_summa_yoq: 0 }), hh(4, { fakt_hajm: 5, f2_hajm: 5, f2_summa: 5000, f2_summa_yoq: 0 })]);
    expect(m.jami.f2).toBe(2_315_300);
    const n = pereraschetYagona(rows, [hh(2, { fakt_hajm: 0, f2_hajm: 150, f2_summa: 2_310_300, f2_summa_yoq: 0 }), hh(4, { fakt_hajm: 5, f2_hajm: 5, f2_summa: 5000, f2_summa_yoq: 0 })]);
    expect(n.jami.minus).toBe(2_310_300);
  });
});
