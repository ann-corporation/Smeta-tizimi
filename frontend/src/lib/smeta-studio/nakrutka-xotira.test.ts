/** Owner 2026-10-16: flexible markup (custom footer, per-resource category) and the estimator's company memory. */
import { describe, expect, it } from 'vitest';
import { applyCommand, type StudioCommand } from './commands';
import { emptyDoc, type RecipeSnapshot } from './model';
import { calcDoc } from './calc';
import { qatorKategoriyasi, resursGuruhlari } from './narx-yigish';
import { standartPodval } from '../nakrutka-konstruktor';
import { suhbatJavobiniTekshir } from '../smeta-ai/protokol';
import { amalBuyruqlari } from '../../admin/sahifalar/studioAgent';

const recipe: RecipeSnapshot[] = [{ recipeId: 'r', status: 'EXACT', resource: { id: '1', code: 'С1', resourceIdCode: '0001', name: 'ПЕСОК СТРОИТЕЛЬНЫЙ', unitCode: '005', type: 'M' },
  norm: '100', candidates: [], candidateCount: 1, prices: [], priceCount: 0 }];
const doc0 = () => ([{ type: 'ADD_SECTION', sectionId: 's', parentId: null, name: 'A' }, { type: 'ADD_OCCURRENCE', occurrenceId: 'o', sectionId: 's', recipe, quantity: '1',
  source: { catalogRevision: 'r', workId: 'w', code: 'E1-1-1-1', name: 'X', unitCode: null, tableLabel: null }, basis: { scale: '1', unitLabel: 'м3', evidence: '1 м3', origin: 'OPERATOR' } }] as StudioCommand[])
  .reduce(applyCommand, emptyDoc('d'));
const units = (c: string | null) => (c === '005' ? 'м3' : null);

describe('moslashuvchan nakrutka', () => {
  it('resurs kategoriyasi qo‘lda tanlanadi va guruh/hisob shu kategoriyada', () => {
    const d = applyCommand(doc0(), { type: 'SET_RESOURCE_KAT', occurrenceId: 'o', recipeId: 'r', kat: 'БЕЗ СКЛАД' });
    expect(qatorKategoriyasi(d.occurrences.o, 'r', d.occurrences.o.recipe[0].resource, units)).toBe('БЕЗ СКЛАД');
    expect(resursGuruhlari(d, calcDoc(d), units)[0].kat).toBe('БЕЗ СКЛАД');
    expect(applyCommand(d, { type: 'SET_RESOURCE_KAT', occurrenceId: 'o', recipeId: 'r', kat: null }).occurrences.o.overrides.r.kat).toBeUndefined();
    expect(() => applyCommand(d, { type: 'SET_RESOURCE_KAT', occurrenceId: 'o', recipeId: 'r', kat: 'XYZ' })).toThrow('KAT_INVALID');
  });
  it('maxsus podval stavkalar bilan saqlanadi; buzuq podval rad etiladi', () => {
    const podval = standartPodval({ ТРАНСПОРТ_МАТЕРИАЛ: 5 });
    const d = applyCommand(doc0(), { type: 'SET_RATES', rates: { values: { ТРАНСПОРТ_МАТЕРИАЛ: 5 }, source: 'shartnoma', podval } });
    expect(d.rates?.podval?.qatorlar.length).toBe(podval.qatorlar.length);
    expect(() => applyCommand(doc0(), { type: 'SET_RATES', rates: { values: {}, source: 'x', podval: { versiya: 1, qatorlar: [] } } })).toThrow('PODVAL_INVALID');
  });
  it('agent: resursni kategoriyaga o‘tkazish', () => {
    const b = amalBuyruqlari(doc0(), { tur: 'resurs_kat', ish: 'песок', qiymat: 'БЕЗ СКЛАД', manba: null, izoh: '' }, () => 'n')!;
    expect(b).toEqual([{ type: 'SET_RESOURCE_KAT', occurrenceId: 'o', recipeId: 'r', kat: 'БЕЗ СКЛАД' }]);
  });
});

describe('kompaniya xotirasi', () => {
  it('model taklif qilgan qoidalar o‘qiladi (≤3, juda qisqasi tashlanadi)', () => {
    const r = suhbatJavobiniTekshir({ javob: 'ok', savollar: [], ishlar: [], amallar: [], xotira: ['G‘isht devor oddiy — облицовка emas, agar aytilmasa', 'qisqa', 'Grunt tashish tarif bo‘yicha narxlanadi'] });
    expect(r.xotira).toEqual(['G‘isht devor oddiy — облицовка emas, agar aytilmasa', 'Grunt tashish tarif bo‘yicha narxlanadi']);
  });
  it('amallar ichiga tushib qolgan ishlar ishlarga qaytariladi', () => {
    const r = suhbatJavobiniTekshir({ javob: 'ok', savollar: [], ishlar: [], amallar: [{ tur: 'ish_qoshish', tavsif: 'Beton tayyorlov', qidiruv: ['Устройство бетонной подготовки'], birlik: 'м3', hajmIfoda: '3,84' }] });
    expect(r.ishlar.map(i => i.tavsif)).toEqual(['Beton tayyorlov']);
  });
});
