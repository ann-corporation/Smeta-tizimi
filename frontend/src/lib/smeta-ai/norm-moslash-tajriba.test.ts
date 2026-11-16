import { describe, expect, it } from 'vitest';
import type { NormWork } from '../catalog-extraction/norm-catalog';
import { NormMoslash } from './norm-moslash';
import { KANON, holatBosh, kompaktla, obyektQosh } from './tajriba-indeks';
import { TajribaIndeks, tajribaOl, tajribaQoy } from './tajriba-qidir';

// SYNTHETIC catalogue: two works with nearly the same wording (the table variants an estimator has to choose between)
const W = (id: string, code: string, name: string): NormWork =>
  ({ id, code, name, bookType: 'Е', collection: 'Е11', section: null, subsection: null, tableCode: 'T', unitCode: '100 м2 покрытия' });
const WORKS = [
  W('1', 'Е11-01-011-1', 'Устройство покрытий из плиток керамических'),
  W('2', 'Е11-01-011-2', 'Устройство покрытий из плиток керамических на клее'),
];
const manba = { allWorks: () => WORKS, tableLabel: () => 'Покрытия', collectionTitle: () => 'Полы' };

describe('exemplar candidates in the matching pipeline', () => {
  const h = holatBosh();
  for (const o of ['o1', 'o2', 'o3']) obyektQosh(h, 'k1', o, [{ nom: 'ПОКРЫТИЕ ПОЛА ПЛИТКОЙ КЕРАМИЧЕСКОЙ', birlik: '100М2', kod: 'Е11-1-11-2', bolim: ['ПОЛЫ'] }]);
  const idx = new TajribaIndeks(kompaktla(h, KANON));
  const nm = new NormMoslash(manba);
  const q = { nom: 'Покрытие пола плиткой керамической', birlik: '100м2', bolim: ['Полы'] };

  it('a code used before for a similar wording is ranked first and the reason says how often', () => {
    const r = nm.qidir({ ...q, tajriba: idx }, 3);
    expect(r[0].d.w.code).toBe('Е11-01-011-2');
    expect(r[0].sabab).toContain('ilgari 3 ta smetada shu shifr ishlatilgan');
  });
  it('without the index the pipeline behaves exactly as before (no reason, no boost)', () => {
    const r = nm.qidir({ ...q, tajriba: null }, 3);
    expect(r.flatMap(x => x.sabab).join(' ')).not.toContain('ilgari');
  });
  it('the loaded index is the default source', () => {
    expect(tajribaOl()).toBeNull();
    tajribaQoy(idx);
    try { expect(nm.qidir(q, 1)[0].sabab.join(' ')).toContain('ilgari 3 ta smetada'); } finally { tajribaQoy(null); }
  });
});
