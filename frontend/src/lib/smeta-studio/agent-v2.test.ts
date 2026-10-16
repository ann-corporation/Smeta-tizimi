/** Owner 2026-10-16: «по проекту» materials, expert-proof justifications, normative coefficient semantics, the studio agent, minus positions. */
import { describe, expect, it } from 'vitest';
import { applyCommand, type StudioCommand } from './commands';
import { emptyDoc, type RecipeSnapshot } from './model';
import { calcDoc } from './calc';
import { resursNomi } from './loyiha-material';
import { ishKoeffitsientlari, koefgaAylantir, qollanadi, type KoefKatalog } from './koef-katalog';
import { manbaRekviziti, resursGuruhlari } from './narx-yigish';
import { ishHavolalari, smetaXulosasi } from './ai-kontekst';
import { amalBuyruqlari, materialManbadami } from '../../admin/sahifalar/studioAgent';
import type { KatalogQatori } from '../narx-katalog/types';

const recipe: RecipeSnapshot[] = [
  { recipeId: 'r1', status: 'EXACT', resource: { id: '1', code: 'С1', resourceIdCode: '000001', name: 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', unitCode: '001', type: 'R' }, norm: '100', candidates: [], candidateCount: 1, prices: [], priceCount: 0 },
  { recipeId: 'r2', status: 'EXACT', resource: { id: '2', code: 'С2', resourceIdCode: '045027', name: 'БЕТОН (КЛАСС ПО ПРОЕКТУ)', unitCode: '005', type: 'M' }, norm: '102', candidates: [], candidateCount: 1, prices: [], priceCount: 0 },
];
const units = (c: string | null) => ({ '001': 'чел-ч', '005': 'м3' } as Record<string, string>)[c ?? ''] ?? null;
const add = (id: string, sid: string, extra: Partial<Extract<StudioCommand, { type: 'ADD_OCCURRENCE' }>> = {}): StudioCommand => ({ type: 'ADD_OCCURRENCE', occurrenceId: id, sectionId: sid, recipe, quantity: '10',
  source: { catalogRevision: 'r', workId: id, code: 'E6-1-1-22', name: 'УСТРОЙСТВО ЛЕНТОЧНЫХ ФУНДАМЕНТОВ', unitCode: '021', tableLabel: null }, basis: { scale: '100', unitLabel: 'м3', evidence: '100 м3', origin: 'OBSERVED' }, ...extra });
const doc0 = () => ([{ type: 'ADD_SECTION', sectionId: 'a', parentId: null, name: 'Fundament' }, { type: 'ADD_SECTION', sectionId: 'b', parentId: null, name: 'Devor' },
  add('o1', 'a')] as StudioCommand[]).reduce(applyCommand, emptyDoc('d'));

describe('«по проекту» → loyiha materiali', () => {
  it('nom loyiha materiali bilan, material yo‘q bo‘lsa smeta xulosasida «LOYIHA MATERIALI KERAK»', () => {
    expect(resursNomi('БЕТОН (КЛАСС ПО ПРОЕКТУ)', 'Бетон B20; Арматура A500C Ø12')).toBe('БЕТОН B20');
    expect(resursNomi('БЕТОН (КЛАСС ПО ПРОЕКТУ)', null)).toBe('БЕТОН (КЛАСС ПО ПРОЕКТУ)');
    const d = doc0();
    expect(smetaXulosasi(d, calcDoc(d), units)).toContain('[i1] E6-1-1-22 УСТРОЙСТВО ЛЕНТОЧНЫХ ФУНДАМЕНТОВ | hajm: 10 м3 | LOYIHA MATERIALI KERAK: БЕТОН (КЛАСС ПО ПРОЕКТУ)');
    const d2 = applyCommand(d, { type: 'SET_MATERIAL', occurrenceId: 'o1', material: 'Бетон B20' });
    expect(smetaXulosasi(d2, calcDoc(d2), units)).toContain('- БЕТОН B20 | м3 | 10.2 | narx yo‘q');
  });
});

describe('narx obosnovaniyasi — rasmiy rekvizitlar', () => {
  const q = (o: Partial<KatalogQatori>): KatalogQatori => ({ id: 1, manba_id: 1, kod: '1234', nom: 'Бетон М-100', birlik: 'м3', narx: 325500, hudud: 'г. Ташкент', ishlab_chiqaruvchi: 'ООО «Сергели ЗСМ»',
    nds_holati: 'nds_siz', nds_izoh: null, yil: 2026, kvartal: 1, narx_varianti: '2026-03-01', guruh: null, hudud_kalit: 'toshkent_sh', manba_nom: 'Каталог цен РУз, 1 кв. 2026 г.', manba_tur: 'katalog', manba_sana: '2026-04-01', ...o });
  it('katalog: hujjat, varaq, ishlab chiqaruvchi, pozitsiya, sana — ichki ibora yo‘q', () => {
    const t = manbaRekviziti(q({}));
    expect(t).toBe('Каталог цен РУз, 1 кв. 2026 г.; лист «г. Ташкент»; раздел (производитель): ООО «Сергели ЗСМ»; поз. № 1234; отпускная цена без НДС на 01.03.2026');
    expect(t).not.toMatch(/MAX|katalog|narx/i);
  });
  it('birja va mash.-soat ro‘yxati', () => {
    expect(manbaRekviziti(q({ manba_tur: 'birja', manba_nom: 'Котировки УзРТСБ, март 2025 г.', kod: '123', nds_izoh: 'котировка 1 120 000 сум с НДС, неделя 24.03.2025–30.03.2025; без НДС = котировка ÷ 1,12' })))
      .toBe('Котировки УзРТСБ, март 2025 г. (средневзвешенные недельные цены); поз. № 123; котировка 1 120 000 сум с НДС, неделя 24.03.2025–30.03.2025; без НДС = котировка ÷ 1,12');
    expect(manbaRekviziti(q({ manba_tur: 'mash_soat', manba_nom: 'Перечень … на 01.01.2026', narx_varianti: 'стр. 2', kod: '35' }))).toBe('Перечень … на 01.01.2026, стр. 2, поз. № 35, цена без НДС');
  });
  it('rekvizitsiz eski narx qayta narxlashga belgilanadi, operator narxi emas', () => {
    let d = applyCommand(doc0(), { type: 'SET_MATERIAL', occurrenceId: 'o1', material: 'Бетон B20' });
    d = applyCommand(d, { type: 'SET_PRICE', occurrenceId: 'o1', recipeId: 'r2', price: { value: '500000', basis: 'CATALOG_CANDIDATE', evidence: 'Platforma narx katalogi', sourcePriceId: null } });
    d = applyCommand(d, { type: 'SET_PRICE', occurrenceId: 'o1', recipeId: 'r1', price: { value: '50000', basis: 'OPERATOR_MANUAL', evidence: 'КП', sourcePriceId: null } });
    const g = resursGuruhlari(d, calcDoc(d), units);
    expect(g.find(x => x.talab)?.eskiQatorlar).toHaveLength(1);
    expect(g.find(x => !x.talab)?.eskiQatorlar).toBeUndefined();
  });
});

describe('normativ koeffitsient semantikasi (Codex auditi 2026-10-15)', () => {
  const kat: KoefKatalog = { schema: 'koef-katalog-v1', manba: 't', jadval: { '6-1-1': ['П-6001', 'П-12016'], '6-1-3': ['П-6001'] },
    koef: { 'П-6001': { a: 'ТЧ п.3.1', t: 'Кзп=1,04', s: 'от 16 до 35 м', q: '', k: { 'ЧЕЛ': 1.04 }, op: 'MUL', jt: [{ s: 1, t1: 1, t2: 2 }] },
      'П-12016': { a: 'ТЧ п.1.3', t: 'Кзтр=0,005', s: 'на каждый метр сверх 15 м добавить 0,005', q: '', k: { 'ЧЕЛ': 0.005 }, op: 'SHART' } } };
  it('shart matnidagi jadval ro‘yxati qo‘llanishni cheklaydi; parametrli qoida ko‘paytiruvchiga aylanmaydi', () => {
    expect(ishKoeffitsientlari(kat, 'E6-1-1-5').map(n => n.kod)).toEqual(['П-6001', 'П-12016']);
    expect(ishKoeffitsientlari(kat, 'E6-1-3-1')).toEqual([]);
    const sh = ishKoeffitsientlari(kat, 'E6-1-1-5')[1];
    expect(qollanadi(sh)).toBe(false);
    expect(koefgaAylantir(sh, true)).toEqual([]);
  });
});

describe('Studio agenti', () => {
  it('amallar → buyruqlar (bitta BATCH): material, hajm, yangi bo‘limga ko‘chirish, bo‘lim tartibi', () => {
    const d = doc0();
    expect(ishHavolalari(d).get('i1')).toBe('o1');
    let n = 0; const id = () => `n${++n}`;
    const b = [
      ...amalBuyruqlari(d, { tur: 'material', ish: '[i1]', qiymat: 'Бетон B20', manba: null, izoh: '' }, id)!,
      ...amalBuyruqlari(d, { tur: 'hajm', ish: 'i1', qiymat: '34,56', manba: null, izoh: '' }, id)!,
      ...amalBuyruqlari(d, { tur: 'kochir', ish: 'i1', qiymat: 'Poydevor', manba: null, izoh: '' }, id)!,
      ...amalBuyruqlari(d, { tur: 'bolim_tartib', ish: 'Devor', qiymat: 'yuqori', manba: null, izoh: '' }, id)!,
    ];
    const d2 = applyCommand(d, { type: 'BATCH', label: 'AI', commands: b });
    expect(d2.occurrences.o1).toMatchObject({ material: 'Бетон B20', quantity: '34.56' });
    expect(d2.sections[d2.occurrences.o1.sectionId].name).toBe('Poydevor');
    expect(d2.rootOrder.map(s => d2.sections[s].name)).toEqual(['Devor', 'Fundament', 'Poydevor']);
    expect(amalBuyruqlari(d, { tur: 'narxla', ish: null, qiymat: null, manba: null, izoh: '' }, id)).toBeNull();
    expect(() => amalBuyruqlari(d, { tur: 'hajm', ish: 'i9', qiymat: '1', manba: null, izoh: '' }, id)).toThrow('Ish topilmadi');
  });
  it('suhbatda aytilmagan beton sinfi yozilmaydi', () => {
    expect(materialManbadami('Бетон B20', 'poydevor beton B20 bilan')).toBe(true);
    expect(materialManbadami('Бетон B25', 'poydevor beton B20 bilan')).toBe(false);
  });
});

describe('«исключать» pozitsiya (qalinlik farqi)', () => {
  it('miqdor va summa manfiy, jami kamayadi', () => {
    let d = ([{ type: 'ADD_SECTION', sectionId: 'a', parentId: null, name: 'A' }, add('p', 'a'), add('m', 'a', { minus: true })] as StudioCommand[]).reduce(applyCommand, emptyDoc('d'));
    for (const o of ['p', 'm']) d = applyCommand(d, { type: 'SET_PRICE', occurrenceId: o, recipeId: 'r1', price: { value: '1000', basis: 'OPERATOR_MANUAL', evidence: 'x', sourcePriceId: null } });
    const c = calcDoc(d);
    expect(c.occurrences.m.lines[0]).toMatchObject({ quantity: '-10.000000', amount: '-10000.00' });
    expect(c.occurrences.p.lines[0].amount).toBe('10000.00');
    expect(c.sections.a.knownAmount).toBe('0.00');
    expect(applyCommand(d, { type: 'SET_SIGN', occurrenceId: 'm', minus: false }).occurrences.m.ishora).toBeUndefined();
  });
});
