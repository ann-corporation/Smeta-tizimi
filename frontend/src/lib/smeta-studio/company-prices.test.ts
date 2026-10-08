import { describe, expect, it } from 'vitest';
import { emptyDoc, type RecipeSnapshot } from './model';
import { applyCommand, type StudioCommand } from './commands';
import { calcDoc } from './calc';
import { kodNarxi, kompaniyaNarxlari, type KuzatilganNarx } from './company-prices';
import { resourceUnitText } from './resource-units';

const obs = (kod: string, birlik: string, narx: number, obyekt: string, sana: string): KuzatilganNarx => ({ kod, birlik, narx, obyekt, sana });
const r = (id: string, name: string, unitCode: string, kodr: string): RecipeSnapshot =>
  ({ recipeId: id, status: 'EXACT', resource: { id, code: null, resourceIdCode: kodr, name, unitCode, type: 'R' }, norm: '1', candidates: [], candidateCount: 1, prices: [], priceCount: 0 });
const doc = () => ([{ type: 'ADD_SECTION', sectionId: 's', parentId: null, name: 'A' },
  { type: 'ADD_OCCURRENCE', occurrenceId: 'o', sectionId: 's', quantity: '1', basis: { scale: '1', unitLabel: 'м3', evidence: 'e', origin: 'OBSERVED' },
    source: { catalogRevision: 'r', workId: 'w', code: 'E1', name: 'x', unitCode: '003', tableLabel: null },
    recipe: [r('m', 'КРАНЫ НА АВТОМОБИЛЬНОМ ХОДУ 10 Т', '011', '000762'), r('l', 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', '001', '000001'),
      r('b', 'БЕТОН B15', '003', '012100'), r('u', 'ПЕСОК', '003', '009210')] }] as StudioCommand[]).reduce(applyCommand, emptyDoc('d'));

describe('prices from the company’s own estimates (exact resource code)', () => {
  it('machine → MAX; others → most recent; range and count kept', () => {
    const rows = [obs('000762', 'МАШ-Ч', 180000, 'A', '2026-05-01'), obs('000762', 'маш-ч', 210000, 'B', '2026-03-01')];
    expect(kodNarxi(rows, true)).toMatchObject({ narx: 210000, usul: 'MAX', soni: 2, min: 180000 });
    expect(kodNarxi(rows, false)).toMatchObject({ narx: 180000, usul: 'OXIRGI', obyekt: 'A' });
  });
  it('exact code + same unit only; different unit is never priced', () => {
    const k = new Map<string, KuzatilganNarx[]>([
      ['000762', [obs('000762', 'МАШ-Ч', 210000, 'Karting', '2026-05-01')]],
      ['000001', [obs('000001', 'ЧЕЛ-Ч', 52000, 'Karting', '2026-05-01')]],
      ['012100', [obs('012100', 'М3', 780000, 'Karting', '2026-05-01')]],
      ['009210', [obs('009210', 'Т', 90000, 'Karting', '2026-05-01')]],
    ]);
    const d = doc(), res = kompaniyaNarxlari(d, calcDoc(d), k, resourceUnitText);
    expect([res.topildi, res.birlikMosEmas]).toEqual([3, 1]);
    const ov = res.commands.reduce(applyCommand, d).occurrences.o.overrides;
    expect(ov.m.price).toMatchObject({ value: '210000', sourcePriceId: 'kompaniya-smeta:000762' });
    expect(ov.m.price?.evidence).toContain('eng yuqori');
    expect(ov.l.price?.value).toBe('52000'); expect(ov.b.price?.value).toBe('780000'); expect(ov.u).toBeUndefined();
  });
});
