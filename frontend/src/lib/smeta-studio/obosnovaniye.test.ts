import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { emptyDoc, type RecipeSnapshot, type UnitBasis, type WorkSource } from './model';
import { applyCommand, type StudioCommand } from './commands';
import { calcDoc } from './calc';
import { abcHujjat, studioProtokolQatorlari } from './abc-hujjat';
import { olchamliHisob } from './birlik-hisob';
import { aiNarxlash, narxBuyruqlari, qaytaHisobla, resursGuruhlari, type NarxNomzod } from './narx-yigish';
import { narxProtokolXlsx } from '../narx-protokol-hujjat';
import type { KatalogQatori } from '../narx-katalog/types';

const row = (id: number, nom: string, birlik: string, narx: number): KatalogQatori => ({ id, manba_id: 5, kod: null, nom, birlik, narx, hudud: 'г. Ташкент',
  ishlab_chiqaruvchi: null, nds_holati: 'nds_siz', nds_izoh: null, yil: 2026, kvartal: 1, narx_varianti: null, guruh: null, hudud_kalit: 'toshkent', manba_nom: 'Каталог 1 кв. 2026', manba_tur: 'katalog' });
const profnastil = (narx: number): NarxNomzod => ({ id: 'k9', nom: 'Профлист С-21, ширина 1000 мм, толщина 0,5 мм', birlik: 'м2', narx, manba: 'katalog',
  tur: 'katalog', row: row(9, 'Профлист С-21, ширина 1000 мм, толщина 0,5 мм', 'м2', narx), qayta: null, birlikBoshqa: true });

describe('o‘lcham bo‘yicha birlik qayta hisobi', () => {
  it('m² narxi → m: eni nomdan (1000 mm) olinadi, KOD hisoblaydi', () => {
    expect(olchamliHisob('1000/1000', 'eni 1,0 m', 'м', 'м2', ['ПРОФНАСТИЛ', 'Профлист С-21, ширина 1000 мм'])).toMatchObject({ factor: '1' });
    expect(olchamliHisob('1/(2500/1000*1200/1000)', '1 list = 3 m²', 'м2', 'шт', ['ЛИСТЫ ГИПСОКАРТОННЫЕ', 'Лист ГКЛ 2500х1200 мм'])).toMatchObject({ factor: '0.333333' });
    expect(olchamliHisob('4,62/1000', '1 m = 4,62 kg', 'м', 'т', ['ТРУБЫ', 'Труба 57х3,5, масса 1 м 4,62 кг'])).toMatchObject({ factor: '0.00462' });
  });
  it('nomda yo‘q son (o‘ylab topilgan zichlik/og‘irlik), soat birligi va noto‘g‘ri formula rad etiladi', () => {
    expect(olchamliHisob('7850/1000', 'zichlik', 'м3', 'т', ['ЛИСТ СТАЛЬНОЙ', 'Лист стальной 2 мм'])).toEqual({ xato: 'SON_NOMDA_YOQ' });
    expect(olchamliHisob('2', 'x', 'маш-ч', 'шт', ['A', 'B 2'])).toEqual({ xato: 'BIRLIK_MOS_EMAS' });
    expect(olchamliHisob('1000/(', 'x', 'м', 'м2', ['A 1000', 'B'])).toEqual({ xato: 'FORMULA_NOTOGRI' });
  });
  it('qaytaHisobla narxni smeta birligiga o‘tkazadi va obosnovaniyada manba birligi/narxi hamda formula qoladi', () => {
    const n = qaytaHisobla(profnastil(85000), 'ПРОФНАСТИЛ С-21', 'м', '1000/1000', 'eni 1,0 m');
    expect(n).toMatchObject({ narx: 85000, birlik: 'м', birlikBoshqa: false, qayta: { factor: '1' } });
    const [c] = narxBuyruqlari({ qatorlar: [{ occurrenceId: 'o', recipeId: 'r' }] }, n as NarxNomzod, 'ma’nosi mos');
    expect((c as { price: { justification: unknown } }).price.justification).toMatchObject({ docType: 'CATALOG', sourceUnit: 'м2', sourcePrice: '85000',
      conversion: { formula: '1000 / 1000', factor: '1' }, reason: 'ma’nosi mos', document: expect.stringContaining('1 кв. 2026 г.') });
    expect(() => narxBuyruqlari({ qatorlar: [] }, profnastil(1), '')).toThrow('PRICE_UNIT_RECALCULATION_REQUIRED');
  });
});

const res = (id: string, code: string, name: string, type: string, unitCode: string) => ({ id, code, resourceIdCode: '0' + id, name, unitCode, type });
const recipe: RecipeSnapshot[] = [
  { recipeId: 'r1', status: 'EXACT', resource: res('1', 'С001-1', 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'R', '001'), norm: '10', candidates: [], candidateCount: 1, prices: [], priceCount: 0 },
  { recipeId: 'r2', status: 'EXACT', resource: res('2', 'С101-1', 'ПРОФНАСТИЛ С-21', 'M', '023'), norm: '105', candidates: [], candidateCount: 1, prices: [], priceCount: 0 },
];
const units: Record<string, string> = { '001': 'чел-ч', '023': 'м', '021': '100 м2' };
const unitText = (c: string | null) => units[c ?? ''] ?? null;
const source: WorkSource = { catalogRevision: 'rev', workId: 'w', code: 'E12-1-1', name: 'УСТРОЙСТВО КРОВЛИ', unitCode: '021', tableLabel: null };
const basis: UnitBasis = { scale: '100', unitLabel: 'м2', evidence: '100 м2', origin: 'OBSERVED' };
const draft = () => ([
  { type: 'ADD_SECTION', sectionId: 's', parentId: null, name: 'КРОВЛЯ' },
  { type: 'ADD_OCCURRENCE', occurrenceId: 'o1', sectionId: 's', source, recipe, quantity: '200', basis },
] as StudioCommand[]).reduce(applyCommand, emptyDoc('d'));

describe('AI birligi boshqa nomzodni tanlasa — formula tekshiriladi, narx KOD tomonidan hisoblanadi', () => {
  it('to‘g‘ri formula → smeta birligidagi narx; nomda yo‘q son → rad etiladi', async () => {
    const d = draft(), g = resursGuruhlari(d, calcDoc(d), unitText).filter(x => x.kat === 'МАТ');
    const ok = await aiNarxlash(g, () => [profnastil(85000)], async s => [{ id: s[0].id, tanlov: 'k9', ishonch: 'yuqori', sabab: 'eni nomda', qayta_hisob: { ifoda: '1000/1000', izoh: 'eni 1,0 m' } }]);
    expect(ok[0].nomzod).toMatchObject({ narx: 85000, birlik: 'м', qayta: { factor: '1' } });
    const bad = await aiNarxlash(g, () => [profnastil(85000)], async s => [{ id: s[0].id, tanlov: 'k9', ishonch: 'yuqori', sabab: 'x', qayta_hisob: { ifoda: '1,15', izoh: 'taxmin' } }]);
    expect(bad[0]).toMatchObject({ nomzod: null, ishonch: 'past' });
    expect(bad[0].sabab).toContain('qayta hisob rad etildi');
  });
});

describe('hujjatlar: obosnovaniye varag‘i va buyurtmachi–pudratchi protokoli', () => {
  const priced = () => {
    const n = qaytaHisobla(profnastil(85000), 'ПРОФНАСТИЛ С-21', 'м', '1000/1000', 'eni 1,0 m') as NarxNomzod;
    const cmds = [...narxBuyruqlari({ qatorlar: [{ occurrenceId: 'o1', recipeId: 'r2' }] }, n, 'eni nomda'),
      { type: 'SET_PRICE', occurrenceId: 'o1', recipeId: 'r1', price: { value: '26820', basis: 'CATALOG_CANDIDATE', evidence: 'x', sourcePriceId: null,
        justification: { docType: 'LABOUR_HOUR', document: 'Стоимость 1 чел.-часа, г. Ташкент, 1 кв. 2026 г.', sourceName: 'Затраты труда', sourceUnit: 'чел-ч', sourcePrice: '26820', conversion: null, reason: null } } }] as StudioCommand[];
    return cmds.reduce(applyCommand, draft());
  };
  it('LRV+RES kitobida «Обоснование цен»: manba qatori, qayta hisob va tirik formula bilan smeta birligidagi narx', () => {
    const d = priced(), r = abcHujjat(d, calcDoc(d), unitText);
    const wb = XLSX.read(r.bytes);
    expect(wb.SheetNames).toEqual(['LRV', 'RES', 'Обоснование цен']);
    const ws = wb.Sheets['Обоснование цен'];
    const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: '' });
    const p = rows.find(x => x[2] === 'ПРОФНАСТИЛ С-21')!;
    expect(p.slice(6, 12).join('|')).toContain('КАТАЛОГ (ТЕКУЩИЕ ЦЕНЫ)|КАТАЛОГ 1 КВ. 2026');
    expect(p[9]).toBe('М2');
    expect(p[11]).toContain('1000 / 1000');
    const rowNo = rows.indexOf(p) + 1;
    expect(ws[`M${rowNo}`].f).toBe(`ROUND(K${rowNo}*1,2)`);
    expect(rows.some(x => x.join('|').includes('ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ') && x.join('|').includes('СТОИМОСТЬ ЧЕЛ.-ЧАСА'))).toBe(true);
  });
  it('protokol: hujjat narxi (smeta birligida) → kelishilgan narx, obosnovaniye va ikki tomon imzosi', () => {
    const d = priced(), q = studioProtokolQatorlari(d, calcDoc(d), unitText);
    expect(q.find(x => x.nom === 'ПРОФНАСТИЛ С-21')).toMatchObject({ eski_narx: 85000, yangi_narx: 85000, izoh: expect.stringContaining('пересчёт: 1000 / 1000') });
    const r = narxProtokolXlsx(q, { obyektNomi: 'Kafe', raqam: '7', sana: '2026-10-14', imzo: { zakazchik: 'Buyurtmachi MChJ', pudratchi: 'Pudratchi MChJ' },
      ustunNomlari: { eski: 'Цена по документу-основанию (на ед. сметы)', yangi: 'Согласованная договорная цена' }, maqsad: 'на ресурсы, принятые в локальной ресурсной смете' });
    const flat = XLSX.utils.sheet_to_json<string[]>(XLSX.read(r.bytes).Sheets['Протокол цен'], { header: 1, raw: false, defval: '' }).map(x => x.join('|'));
    expect(flat.some(x => x.includes('ПРОТОКОЛ СОГЛАСОВАНИЯ ЦЕН № 7'))).toBe(true);
    expect(flat.some(x => x.includes('Согласованная договорная цена'))).toBe(true);
    expect(flat.some(x => x.includes('ЗАКАЗЧИК'))).toBe(true);
    expect(flat.some(x => x.includes('ПОДРЯДЧИК'))).toBe(true);
  });
});
