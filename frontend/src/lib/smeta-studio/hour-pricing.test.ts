import { describe, expect, it } from 'vitest';
import type { HourCatalog } from '../hour-price-catalog';
import { emptyDoc, type RecipeSnapshot } from './model';
import { applyCommand, type StudioCommand } from './commands';
import { calcDoc } from './calc';
import { hourPrices, labourPeriods } from './hour-pricing';
import { resourceUnitText } from './resource-units';

const cat: HourCatalog = { schema: 'hour-price-catalog-v1', machineCoverage: 'PARTIAL_VERIFIED_SUBSET',
  machines: [{ machineKey: 'экскаваторы одноковшовые 0,65 м3', name: 'Экскаваторы одноковшовые 0,65 м3', unit: 'маш-ч', price: '410000',
    sourceKey: 'p3', sourceSha256: 'a'.repeat(64), sourceDate: '2025-01-01', page: 3, vat: 'EXCLUDED' }],
  labour: [
    { id: 'nav-q1', name: 'ЗАТРАТЫ ТРУДА', region: 'Навоийская область', aggregate: false, year: 2026, quarter: 1, unit: 'чел-ч', price: '48000', socialInsurance: 'EXCLUDED', sourceSha256: 'b'.repeat(64), sheet: '1 квартал', baseCell: 'C10' },
    { id: 'nav-q2', name: 'ЗАТРАТЫ ТРУДА', region: 'Навоийская область', aggregate: false, year: 2026, quarter: 2, unit: 'чел-ч', price: '50792.38', socialInsurance: 'EXCLUDED', sourceSha256: 'b'.repeat(64), sheet: '2 квартал', baseCell: 'C10' },
  ] };
const r = (id: string, name: string, type: string, unitCode: string, kodr: string): RecipeSnapshot =>
  ({ recipeId: id, status: 'EXACT', resource: { id, code: null, resourceIdCode: kodr, name, unitCode, type }, norm: '1', candidates: [], candidateCount: 1, prices: [], priceCount: 0 });
const recipe = [r('w', 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'R', '001', '000001'), r('op', 'ЗАТРАТЫ ТРУДА МАШИНИСТОВ', 'R', '001', '000003'),
  r('ex', 'ЭКСКАВАТОРЫ ОДНОКОВШОВЫЕ 0,65 М3', 'R', '011', '001942'), r('ex10', 'ЭКСКАВАТОРЫ ОДНОКОВШОВЫЕ 1 М3', 'R', '011', '001943'),
  r('m', 'БЕТОН ТЯЖЕЛЫЙ B15', 'M', '003', '012100')];
const doc = () => ([{ type: 'ADD_SECTION', sectionId: 's', parentId: null, name: 'Yer ishlari' },
  { type: 'ADD_OCCURRENCE', occurrenceId: 'o', sectionId: 's', recipe, quantity: '10', basis: { scale: '1', unitLabel: 'м3', evidence: 'e', origin: 'OBSERVED' },
    source: { catalogRevision: 'r', workId: 'w', code: 'E1-1', name: 'Разработка грунта', unitCode: '003', tableLabel: null } }] as StudioCommand[]).reduce(applyCommand, emptyDoc('d'));

describe('labour / machine-hour pricing from the hour catalogue', () => {
  it('periods newest first, only those that have rates', () => {
    expect(labourPeriods(cat)).toEqual([{ year: 2026, quarter: 2 }, { year: 2026, quarter: 1 }]);
  });
  it('worker rate by region+period; operator NOT priced with worker rate; exact machine only; materials untouched', () => {
    const d = doc(), res = hourPrices(d, calcDoc(d), cat, resourceUnitText, 'navoiy', { year: 2026, quarter: 2 });
    expect(res).toMatchObject({ labour: 1, machines: 1, operatorsLeft: 1, notFound: 1 });
    const priced = res.commands.reduce(applyCommand, d).occurrences.o.overrides;
    expect(priced.w.price).toMatchObject({ value: '50792.38', basis: 'CATALOG_CANDIDATE', sourcePriceId: 'hour-labour:nav-q2' });
    expect(priced.w.price?.evidence).toContain('ijtimoiy sug‘urtasiz');
    expect(priced.ex.price?.value).toBe('410000');
    expect(priced.op).toBeUndefined(); expect(priced.ex10).toBeUndefined(); expect(priced.m).toBeUndefined();
  });
  it('no region or period → no labour price (never a national average fallback)', () => {
    const d = doc();
    expect(hourPrices(d, calcDoc(d), cat, resourceUnitText, null, { year: 2026, quarter: 2 }).labour).toBe(0);
    expect(hourPrices(d, calcDoc(d), cat, resourceUnitText, 'navoiy', { year: 2026, quarter: 3 }).labour).toBe(0);
  });
});
