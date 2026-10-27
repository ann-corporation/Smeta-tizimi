import { expect, it } from 'vitest';
import type { T2Qator } from '../../src/api/supabase';
import { bolimSummalari, nakopitelniyMoslik, type JurnalHolat } from '../../src/lib/fakt-jurnal';

const q = (o: Partial<T2Qator> & { id: number; tur: string }): T2Qator => ({
  obyekt_id: 1, obyekt: null, kompaniya_id: 1, ota_id: null, daraja: 0, tartib: o.id, kod: null, nom: `Qator ${o.id}`, birlik: 'м3',
  hajm: null, narx: null, summa: null, kat: 'МАТ', narx_usul: null, qoshimcha: false, zamena: false,
  d1: null, d2: null, d3: null, xom_qator: null, yangilandi: null, manba_id: null, versiya: 1, ...o,
} as T2Qator);

const tree: T2Qator[] = [
  q({ id: 1, tur: 'rz', nom: 'Bo‘lim' }),
  q({ id: 2, tur: 'bl', ota_id: 1, daraja: 1, nom: 'Ma’lum summa ishi' }),
  q({ id: 3, tur: 'mat', ota_id: 2, daraja: 2, nom: 'Ma’lum resurs' }),
  q({ id: 4, tur: 'bl', ota_id: 1, daraja: 1, nom: 'Noma’lum summa ishi' }),
  q({ id: 5, tur: 'mat', ota_id: 4, daraja: 2, nom: 'Noma’lum resurs' }),
];

const holat = (qator_id: number, f2_summa: number | null): JurnalHolat => ({
  qator_id, smeta_hajm: 1, smeta_summa: 0, fakt_hajm: 0, fakt_summa: 0, f2_hajm: f2_summa === 0 ? 0 : 1, f2_summa,
});

it('production helper: known empty F2 is zero; unknown F2 amount remains NULL and counted', () => {
  const empty = bolimSummalari(tree, [holat(3, 0), holat(5, 0)]).get(0)!;
  expect(empty.f2.ustamasiz).toBe(0);
  expect(empty.f2.kesim.summasizSoni).toBe(0);

  const unknownOnly = bolimSummalari(tree.slice(0, 3), [holat(3, null)]).get(0)!;
  expect(unknownOnly.f2.ustamasiz).toBeNull();
  expect(unknownOnly.f2.kesim.summasizSoni).toBe(1);
});

it('strict production-helper diagnostic: mixed known and unknown F2 must not compare a partial sum as complete', () => {
  const jami = bolimSummalari(tree, [holat(3, 100), holat(5, null)]).get(0)!;
  expect(jami.f2.ustamasiz).toBe(100);
  expect(jami.f2.kesim.summasizSoni).toBe(1);

  // Contract: the tree helper has an unknown component, so no exact cumulative-F2 delta is available.
  expect(nakopitelniyMoslik(jami, { smeta_summa: 0, jami_tasdiqlangan_summa: 5400 }))
    .toMatchObject({ f2Farq: null, mos: true });
});
