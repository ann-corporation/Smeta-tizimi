import { describe, expect, it } from 'vitest';
import { natijadanTakliflar } from './excel-kopriq';
import type { Natija } from '../f2-texnadzor-solishtir';

const n = (o: Partial<Natija>): Natija => ({ qator: 1, id: 5, tip: 'bl', shifr: 'A', nom: 'X', izoh: '', rang: null, fHajm: null, dHajm: 4, fNarx: null, dNarx: null, holat: 'TENG', kiritilgan: false, izohHolat: null, chip: null, hisobga: true, rs: false, ...o });
describe('natijadanTakliflar: Excel solishtirish -> taklif yozuvlari', () => {
  it('hajm farqi -> hajm_notogri; hujjat izohi -> hujjat_kerak; izoh -> izoh; teng/qo\'shimcha/idsiz o\'tkaziladi', () => {
    const r = natijadanTakliflar([
      n({ id: 1, holat: 'HAJM_FARQ', fHajm: 1 }), n({ id: 2, izoh: 'lab xulosasi kerak', izohHolat: 'HUJJAT_KERAK' }), n({ id: 3, izoh: 'tushunarsiz' }),
      n({ id: 4 }), n({ id: null, holat: 'KALITSIZ' }), n({ id: 6, holat: 'FAYLDA_YOQ' }), n({ id: 7, holat: 'HAJM_FARQ', fHajm: 2, hisobga: false }),
    ]);
    expect(r.map((x) => [x.qator_id, x.bayroq, x.taklif_hajm])).toEqual([[1, 'hajm_notogri', 1], [2, 'hujjat_kerak', null], [3, null, null]]);
    expect(r[1].hujjat_turi).toBeTruthy(); expect(r[2].izoh).toBe('tushunarsiz');
  });
});