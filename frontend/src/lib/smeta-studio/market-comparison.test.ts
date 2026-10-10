import { describe, expect, it, vi } from 'vitest';
import { PriceCatalog, type KatalogQatori, type PriceManifest } from '../narx-katalog/price-remote';
import type { PriceDict, PriceRow } from '../narx-katalog/price-shards';
import * as matcher from './resource-match';
import { compareMarket, marketException, marketPeriods, marketRegions } from './market-comparison';

const name = 'АРМАТУРА А500С Ø12';
function catalog(rows: Partial<KatalogQatori>[], sourceYear = 2026, sourceQuarter = 2, sourceVat: string | null = 'nds_siz') {
  const dict: PriceDict = { birlik: ['т', 'кг', 'м3', 'шт'], hudud: ['Ташкент', 'Самарканд'], hududKalit: ['tashkent', 'samarkand'],
    zavod: ['A', 'B'], ndsHolati: ['nds_siz', 'nds_bilan', 'unknown'], ndsIzoh: [], variant: [], guruh: [], keyOverrides: {},
    manba: { id: 1, tur: 'platforma', nom: 'source.xlsx', raqam: null, sana: null, yil: sourceYear, kvartal: sourceQuarter,
      region: null, yetkazuvchi: null, nds_holati: sourceVat, fayl_document_id: null } };
  const packed: PriceRow[] = rows.map((r, i) => [i + 1, null, 'UNUSED', r.nom ?? name, r.birlik === undefined ? 0 : dict.birlik.indexOf(r.birlik!),
    r.narx === null ? null : String(r.narx ?? 8300000), r.hudud_kalit === undefined ? 0 : dict.hududKalit.indexOf(r.hudud_kalit),
    r.ishlab_chiqaruvchi === undefined ? 0 : dict.zavod.indexOf(r.ishlab_chiqaruvchi!), r.nds_holati === undefined ? 0 : dict.ndsHolati.indexOf(r.nds_holati!), -1,
    r.yil ?? null, r.kvartal ?? null, -1, -1]);
  const manifest = { revision: 'test', source: { manba: dict.manba } } as PriceManifest;
  // Exercise the real qator()/matchView() implementation with an in-memory verified-input fixture.
  const Constructor = PriceCatalog as unknown as new (m: PriceManifest, d: PriceDict, r: PriceRow[]) => PriceCatalog;
  return new Constructor(manifest, dict, packed);
}
const line = (price: number | null = 7500000) => ({ id: 'l', name, unit: 'т', price });

describe('read-only material market comparison', () => {
  it('unknown row and source VAT produce no offers; explicit VAT-free rows remain usable', () => {
    const unknown = catalog([{ nds_holati: null }], 2026, 2, null);
    // Prove this is the comparison scope's gate, not matchView already filtering the price.
    expect(unknown.matchView().price(0)).toBe(8300000);
    expect(compareMarket([line()], unknown)[0]).toMatchObject({ status: 'no-offers', average: null, offers: [] });
    const mixed = catalog([{ nds_holati: null, narx: 1 }, { nds_holati: 'unknown', narx: 2 },
      { nds_holati: 'nds_bilan', narx: 3 }, { nds_holati: 'nds_siz', narx: 8300000 }], 2026, 2, null);
    const r = compareMarket([line()], mixed)[0];
    expect(r).toMatchObject({ status: 'compared', average: 8300000, min: 8300000, max: 8300000 });
    expect(r.offers).toHaveLength(1); expect(r.offers[0].row.nds_holati).toBe('nds_siz');
  });
  it('inherits only known source VAT and never overrides an explicit row VAT status', () => {
    expect(compareMarket([line()], catalog([{ nds_holati: null }]))[0].average).toBe(8300000);
    for (const sourceVat of [null, 'unknown', 'nds_bilan']) {
      expect(compareMarket([line()], catalog([{ nds_holati: null }], 2026, 2, sourceVat))[0].status).toBe('no-offers');
    }
    expect(compareMarket([line()], catalog([{ nds_holati: 'unknown' }]))[0].status).toBe('no-offers');
    expect(compareMarket([line()], catalog([{ nds_holati: 'nds_bilan' }]))[0].status).toBe('no-offers');
    expect(compareMarket([line()], catalog([{ nds_holati: 'nds_siz' }], 2026, 2, 'nds_bilan'))[0].average).toBe(8300000);
  });
  it('scales kg to t, excludes diameter/quarter/region/VAT and deduplicates source offers', () => {
    const cat = catalog([
      { narx: 8200000, yil: 2026, kvartal: 2 }, { narx: 8200000, yil: 2026, kvartal: 2 },
      { narx: 8400, birlik: 'кг', ishlab_chiqaruvchi: 'B', yil: 2026, kvartal: 2 },
      { nom: 'АРМАТУРА А500С Ø16', narx: 99999999 }, { narx: 1, yil: 2026, kvartal: 1 },
      { narx: 2, hudud_kalit: 'samarkand' }, { narx: 3, nds_holati: 'nds_bilan' },
    ]);
    const input = Object.freeze([Object.freeze(line())]);
    const r = compareMarket(input, cat, undefined, 'tashkent')[0];
    expect(r).toMatchObject({ status: 'compared', average: 8300000, min: 8200000, max: 8400000, delta: 800000 });
    expect(r.percent).toBeCloseTo(10.6666667, 6);
    expect(r.offers).toHaveLength(2);
    expect(r.offers[1].conversion).toMatchObject({ sourcePrice: 8400, priceFactor: 1000, sourceUnit: 'кг', targetUnit: 'т' });
    expect(input[0].price).toBe(7500000);
    expect(compareMarket(input, cat, { year: 2026, quarter: 1 }, 'tashkent')[0].average).toBe(1);
  });
  it('retains manufacturers and regions as distinct offers; selects actual latest source period', () => {
    const cat = catalog([{ narx: 10 }, { narx: 20, ishlab_chiqaruvchi: 'B' }, { narx: 30, hudud_kalit: 'samarkand' }, { yil: 2025, kvartal: 4 }]);
    expect(marketPeriods(cat)).toEqual([{ year: 2026, quarter: 2 }, { year: 2025, quarter: 4 }]);
    expect(marketRegions(cat)).toEqual(expect.arrayContaining([['tashkent', 'Ташкент'], ['samarkand', 'Самарканд']]));
    expect(compareMarket([line()], cat)[0]).toMatchObject({ average: 20, offers: expect.any(Array) });
    expect(compareMarket([line()], cat)[0].offers).toHaveLength(3);
  });
  it('generic rebar and concrete never acquire a numerical average', () => {
    const cat = catalog([{ nom: 'АРМАТУРА', narx: 7 }, { nom: 'БЕТОН', birlik: 'м3', narx: 10 }]);
    const out = compareMarket([{ ...line(), name: 'АРМАТУРА' }, { ...line(), name: 'БЕТОН', unit: 'м3' }], cat);
    expect(out.map(r => [r.status, r.average])).toEqual([['review', null], ['review', null]]);
  });
  it('distinguishes null, zero, equality, unknown unit/name and unsupported hours', () => {
    const cat = catalog([{ narx: 0 }]);
    const [zero, unknown, unit, hours, missingName] = compareMarket([line(0), line(null), { ...line(), unit: null },
      { ...line(), unit: 'маш-ч' }, { ...line(), name: null }], cat);
    expect(zero).toMatchObject({ average: 0, delta: 0, percent: null }); expect(marketException(zero)).toBe(false);
    expect(unknown).toMatchObject({ average: 0, delta: null, percent: null }); expect(marketException(unknown)).toBe(true);
    expect(unit.status).toBe('unknown-unit'); expect(hours.status).toBe('unsupported'); expect(marketException(hours)).toBe(false); expect(missingName.status).toBe('unknown-name');
    expect(compareMarket([line(9000000)], catalog([{}]))[0].delta).toBe(-700000);
  });
  it('unknown catalogue period and empty catalogue remain explicit', () => {
    expect(compareMarket([line()], catalog([{}], 0, 0))[0].status).toBe('unknown-period');
    expect(compareMarket([line()], catalog([]))[0].status).toBe('no-offers');
  });
  it('keeps equipment measured in pieces in the material catalogue and unknown units unknown', () => {
    const nom = 'ГЕНЕРАТОР 5 КВТ'; const cat = catalog([{ nom, birlik: 'шт', narx: 100 }]);
    expect(compareMarket([{ ...line(90), name: nom, unit: 'шт' }], cat)[0]).toMatchObject({ status: 'compared', average: 100 });
    expect(compareMarket([{ ...line(), name: nom, unit: null }], cat)[0].status).toBe('unknown-unit');
  });
  it('never combines a partial row period with the source quarter or year', () => {
    const cat = catalog([{ yil: 2025, kvartal: null, narx: 1 }, { yil: null, kvartal: 1, narx: 2 }, { narx: 100 }]);
    expect(marketPeriods(cat)).toEqual([{ year: 2026, quarter: 2 }]);
    expect(compareMarket([line()], cat)[0]).toMatchObject({ average: 100 });
    expect(compareMarket([line()], cat)[0].offers).toHaveLength(1);
  });
  it('ambiguous identity never averages competing grades', () => {
    const cat = catalog([{ nom: 'ТРУБА СТАЛЬНАЯ Ø12 МАРКИ А1' }, { nom: 'ТРУБА СТАЛЬНАЯ Ø12 МАРКИ А2' }]);
    expect(compareMarket([{ ...line(), name: 'ТРУБА СТАЛЬНАЯ Ø12' }], cat)[0]).toMatchObject({ status: 'review', average: null });
  });
  it('10,000 duplicate resources match only once and keep independent estimate prices', () => {
    const spy = vi.spyOn(matcher, 'matchResource'); const cat = catalog([{}]);
    const lines = Array.from({ length: 10000 }, (_, i) => ({ ...line(i), id: String(i) }));
    const r = compareMarket(lines, cat); compareMarket(lines, cat);
    expect(spy).toHaveBeenCalledTimes(1); expect(r).toHaveLength(10000);
    expect(r[9999].delta).toBe(8300000 - 9999); spy.mockRestore();
  });
});
