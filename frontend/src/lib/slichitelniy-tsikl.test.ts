import { describe, expect, it } from 'vitest';
import type { PQator } from './pereraschet';
import { faktPereraschetHisobla } from './pereraschet-fakt';
import { slichitelniyTsiklYuki } from './slichitelniy-tsikl';

/* Sintetik: к доплате (fakt > F-2), к снятию (F-2 > fakt, tuzatish aktidan keyingi sof F-2), teng (yukka kirmaydi), narxsiz (kirmaydi). */
const r = (id: number, ex: Partial<PQator>): PQator => ({
  qator_id: id, ota_id: 1, tur: 'mat', kod: 'К' + id, nom: 'МАТЕРИАЛ ' + id, birlik: 'м3', kat: 'МАТ',
  smeta_hajm: 10, smeta_narx: 1000, smeta_summa: 10_000, fakt_hajm: 0, fakt_summa: 0, f2_hajm: 0, f2_summa: 0, ...ex,
});
const ROWS: PQator[] = [
  { qator_id: 1, ota_id: null, tur: 'rz', kod: null, nom: 'РАЗДЕЛ', birlik: null, kat: null, smeta_hajm: null, smeta_narx: null, fakt_hajm: null, f2_hajm: null, f2_summa: null },
  r(2, { fakt_hajm: 8, f2_hajm: 5, f2_summa: 5000 }),    // +3 × 1000 = +3000 к доплате
  r(3, { fakt_hajm: 4, f2_hajm: 7, f2_summa: 7000 }),    // −3 × 1000 = −3000 к снятию
  r(4, { fakt_hajm: 6, f2_hajm: 6, f2_summa: 6000 }),    // teng
  r(5, { fakt_hajm: 5, f2_hajm: 0, f2_summa: 0, smeta_narx: null }), // narxsiz — tekshirish, pulga kirmaydi
];

describe('slichitelniy sikli — ± qatorlar ishora bo‘yicha bo‘linadi', () => {
  const n = faktPereraschetHisobla(ROWS);
  const y = slichitelniyTsiklYuki(n);
  it('к доплате va к снятию alohida yuk; jami; teng va narxsiz qator yukka kirmaydi (NULL ≠ 0)', () => {
    expect(y.doplata.map((q) => [q.qatorId, q.certifiedQuantity, q.certifiedAmount])).toEqual([[2, 3, 3000]]);
    expect(y.snyatie.map((q) => [q.qatorId, q.certifiedQuantity, q.certifiedAmount])).toEqual([[3, -3, -3000]]);
    expect(y.doplataJami).toBe(3000);
    expect(y.snyatieJami).toBe(-3000);
    expect(n.tekshirish.map((p) => p.qatorId)).toEqual([5]);
  });
  it('tuzatuvchi qatorda manba belgisi (server qoralama yuki) va ishorali narx', () => {
    expect(y.snyatie[0].rawSnapshot).toMatchObject({ source: 'pereraschet_fakt', bolim: 'farq' });
    expect(y.snyatie[0].certifiedUnitPrice).toBe(1000);
  });
});
