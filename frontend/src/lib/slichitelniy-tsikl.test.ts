import { describe, expect, it } from 'vitest';
import type { T2Qator, T2QatorHolat } from '../api/supabase';
import { slichitelniyModeli } from './slichitelniy-vedomost';
import { slichitelniyTsiklYuki } from './slichitelniy-tsikl';

/* Sintetik. Sikl hisobi HUJJAT bilan bir xil: к доплате = max(fakt − F-2, 0), к снятию = min(fakt − F-2, 0), smeta bilan cheklanmaydi. */
function q(id: number, ota: number | null, tur: string, hajm: number | null, nom: string, ex: Partial<T2Qator> = {}): T2Qator {
  return { id, obyekt_id: 1, obyekt: 'X', kompaniya_id: 1, ota_id: ota, daraja: 0, tartib: id, tur, kod: 'К' + id, nom, birlik: 'м3', hajm, narx: 1000, summa: null,
    kat: tur === 'rz' || tur === 'bl' ? null : 'МАТ', narx_usul: null, qoshimcha: false, zamena: false, d1: null, d2: null, d3: null, xom_qator: id, yangilandi: null,
    manba_id: null, versiya: 1, raqam: null, norma: null, ...ex } as T2Qator;
}
const h = (id: number, fakt: number | null, f2h: number, f2s: number | null): T2QatorHolat =>
  ({ id, qator_id: id, obyekt_id: 1, tur: null, kod: null, nom: null, birlik: null, kat: null, smeta_hajm: null, smeta_summa: null, fakt_hajm: fakt, fakt_summa: 0,
    f2_hajm: f2h, f2_summa: f2s, qoldiq_hajm: null, qoldiq_summa: null }) as unknown as T2QatorHolat;

const ROWS = [
  q(1, null, 'rz', null, 'РАЗДЕЛ'), q(2, 1, 'bl', 10, 'ИШ'),
  q(3, 2, 'mat', 10, 'ДОПЛАТА'),     // fakt 8, F-2 5 → +3000
  q(4, 2, 'mat', 10, 'СНЯТИЕ'),      // fakt 4, F-2 7 → −3000
  q(5, 2, 'mat', 10, 'ТЕНГ'),        // fakt 6 = F-2 6
  q(6, 2, 'mat', 10, 'F2 ОРТИҚ'),    // F-2 15 > smeta 10, fakt = F-2 15 → 0 (smeta bilan cheklanmaydi)
  q(7, 2, 'mat', 10, 'F2 ОРТИҚ СНЯТИЕ'), // F-2 15 > smeta, fakt 12 < F-2 → −3000 (faqat fakt < F-2)
  q(8, 2, 'mat', 10, 'ФАКТ ОРТИҚ'),  // fakt 14 > smeta 10, F-2 10 → +4000 (ogohlantirish emas, к доплате)
  q(9, 2, 'mat', 10, 'ФАКТ ЙЎҚ'),    // fakt NULL → bo'sh, yukka kirmaydi
];
const HOLAT = [h(3, 8, 5, 5000), h(4, 4, 7, 7000), h(5, 6, 6, 6000), h(6, 15, 15, 15_000), h(7, 12, 15, 15_000), h(8, 14, 10, 10_000), h(9, null, 0, 0)];

describe('slichitelniy sikli — hujjat bilan bir xil qoida', () => {
  const m = slichitelniyModeli(ROWS, HOLAT);
  const y = slichitelniyTsiklYuki(m);
  it('к доплате / к снятию: smeta bilan cheklanmaydi; fakt = F-2 (F-2 > smeta) → farq 0', () => {
    expect(y.doplata.map((x) => [x.qatorId, x.certifiedQuantity, x.certifiedAmount])).toEqual([[3, 3, 3000], [8, 4, 4000]]);
    expect(y.snyatie.map((x) => [x.qatorId, x.certifiedQuantity, x.certifiedAmount])).toEqual([[4, -3, -3000], [7, -3, -3000]]);
    expect(y.snyatie.some((x) => x.qatorId === 6)).toBe(false);
    expect(y.doplata.some((x) => x.qatorId === 6)).toBe(false);
  });
  it('jami hujjat (model.pereraschet) bilan teng; noma‘lum yukka kirmaydi', () => {
    expect(y.doplataJami).toBe(m.pereraschet.doplata);
    expect(y.snyatieJami).toBe(m.pereraschet.snyatie);
    expect(y.nomalum).toBe(1);
    expect(y.snyatie[0].certifiedUnitPrice).toBe(1000);
  });
});
