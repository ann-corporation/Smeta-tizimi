import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { emptyDoc, type RecipeSnapshot, type UnitBasis, type WorkSource } from './model';
import { applyCommand, type StudioCommand } from './commands';
import { calcDoc } from './calc';
import { abcHujjat } from './abc-hujjat';
import { aiNarxlash, nakrutkaKategoriyasi, narxBuyruqlari, narxNomzodlari, resursGuruhlari, type NarxNomzod } from './narx-yigish';
import { NAKRUTKA_KATLAR, nakrutkaKaskadJS } from '../nakrutka-podval';
import type { MatchCatalog } from './resource-match';
import type { KatalogQatori } from '../narx-katalog/types';

const res = (id: string, kodr: string, code: string, name: string, type: string, unitCode: string) => ({ id, code, resourceIdCode: kodr, name, unitCode, type });
const recipe: RecipeSnapshot[] = [
  { recipeId: 'r1', status: 'EXACT', resource: res('1', '000001', 'С001-1', 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'R', '001'), norm: '5.02', candidates: [], candidateCount: 1, prices: [], priceCount: 0 },
  { recipeId: 'r2', status: 'EXACT', resource: res('2', '000003', 'С001-3', 'ЗАТРАТЫ ТРУДА МАШИНИСТОВ', 'R', '001'), norm: '21.18', candidates: [], candidateCount: 1, prices: [], priceCount: 0 },
  { recipeId: 'r3', status: 'EXACT', resource: res('3', '001942', 'С207-149', 'ЭКСКАВАТОРЫ НА ГУСЕНИЧНОМ ХОДУ', 'X', '011'), norm: '10.59', candidates: [], candidateCount: 1, prices: [], priceCount: 0 },
  { recipeId: 'r4', status: 'EXACT', resource: res('4', '012303', 'С140-12303', 'ПЕСОК ДЛЯ СТРОИТЕЛЬНЫХ РАБОТ ПРИРОДНЫЙ', 'M', '003'), norm: '120', candidates: [], candidateCount: 1, prices: [], priceCount: 0 },
];
const units: Record<string, string> = { '001': 'чел-ч', '011': 'маш-ч', '003': 'м3', '015': '1000 м3' };
const unitText = (c: string | null) => units[c ?? ''] ?? null;
const source: WorkSource = { catalogRevision: 'rev', workId: 'w', code: 'E1-1-195-20', name: 'РАЗРАБОТКА ГРУНТА', unitCode: '015', tableLabel: null };
const basis: UnitBasis = { scale: '1000', unitLabel: 'м3', evidence: 'KodI 015 = 1000 м3', origin: 'OBSERVED' };
const price = (recipeId: string, value: string): StudioCommand => ({ type: 'SET_PRICE', occurrenceId: 'o1', recipeId, price: { value, basis: 'CONTRACT_DRAFT', evidence: 'x', sourcePriceId: null } });
const draft = (priced = true) => ([
  { type: 'ADD_SECTION', sectionId: 's', parentId: null, name: 'ЗЕМЛЯНЫЕ РАБОТЫ' },
  { type: 'ADD_OCCURRENCE', occurrenceId: 'o1', sectionId: 's', source, recipe, quantity: '2529.9', basis },
  ...(priced ? [price('r1', '25000'), price('r2', '30000'), price('r3', '410000'), price('r4', '90000')] : []),
] as StudioCommand[]).reduce(applyCommand, emptyDoc('d'));
const sheet = (bytes: Uint8Array, name: string) => XLSX.utils.sheet_to_json<string[]>(XLSX.read(bytes).Sheets[name], { header: 1, raw: false, defval: '' });
const num = (v: unknown) => Number(String(v).replace(/[\s,]/g, '')); // sheet_to_json: "55,877,198.35"

const row = (id: number, nom: string, birlik: string, narx: number, hudud: string | null = null): KatalogQatori => ({ id, manba_id: 5, kod: null, nom, birlik, narx,
  hudud, ishlab_chiqaruvchi: null, nds_holati: 'nds_siz', nds_izoh: null, yil: 2026, kvartal: 1, narx_varianti: null, guruh: null, hudud_kalit: hudud, manba_nom: 'Каталог 1 кв. 2026', manba_tur: 'katalog' });
const katalog = (rows: KatalogQatori[]): MatchCatalog => ({ size: rows.length, name: i => rows[i].nom, unit: i => rows[i].birlik, region: i => rows[i].hudud_kalit,
  price: i => rows[i].narx, row: i => rows[i] });

describe('Narxlash bosqichi: RES kabi resurslar, manbali nomzodlar, AI 2 bosqichda', () => {
  it('LRV resurslari kategoriya bo‘yicha guruhlanadi; mashinist mehnati МАШ da', () => {
    const d = draft(false), g = resursGuruhlari(d, calcDoc(d), unitText);
    expect(g.map(x => [x.kat, x.nom])).toEqual([
      ['ЧЕЛ', 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ'], ['МАШ', 'ЗАТРАТЫ ТРУДА МАШИНИСТОВ'], ['МАШ', 'ЭКСКАВАТОРЫ НА ГУСЕНИЧНОМ ХОДУ'], ['МАТ', 'ПЕСОК ДЛЯ СТРОИТЕЛЬНЫХ РАБОТ ПРИРОДНЫЙ']]);
    expect(g.every(x => x.narxsiz === 1)).toBe(true);
  });

  it('kategoriya: kabel → КАБ, С121 → М/К, tovar beton → БЕЗ СКЛАД', () => {
    expect(nakrutkaKategoriyasi(res('x', '', 'С157-1', 'КАБЕЛЬ АВВГ 4Х16', 'M', '003'), unitText)).toBe('КАБ');
    expect(nakrutkaKategoriyasi(res('x', '', 'С121-9', 'КОНСТРУКЦИИ СТАЛЬНЫЕ', 'M', '003'), unitText)).toBe('М/К');
  });

  it('nomzodlar: nom boshqacha yozilgan katalog qatori topiladi, xarakteristikasi zid qator kirmaydi', () => {
    const cat = katalog([row(1, 'Песок для строительных работ (природный) крупный, 2 класс, фр. 0-5 мм', 'м3', 90000), row(2, 'Бетон класса В 25', 'м3', 600000)]);
    expect(narxNomzodlari({ nom: 'ПЕСОК ДЛЯ СТРОИТЕЛЬНЫХ РАБОТ ПРИРОДНЫЙ', birlik: 'м3' }, cat, null, null).map(n => n.id)).toEqual(['k1']);
    expect(narxNomzodlari({ nom: 'БЕТОН ТЯЖЕЛЫЙ КЛАСС В15', birlik: 'м3' }, cat, null, null)).toEqual([]);
  });

  it('birlik konversiyasi faqat aniq (т ↔ кг) va dalilda yoziladi', () => {
    const n = narxNomzodlari({ nom: 'ГВОЗДИ СТРОИТЕЛЬНЫЕ', birlik: 'кг' }, katalog([row(7, 'Гвозди строительные', 'т', 10_000_000)]), null, null);
    expect(n[0]).toMatchObject({ narx: 10000, konversiya: '10000000/т × 0.001 = 10000/кг' });
    const [c] = narxBuyruqlari({ qatorlar: [{ occurrenceId: 'o1', recipeId: 'r4' }] }, n[0], 'mos');
    expect(c).toMatchObject({ type: 'SET_PRICE', price: { value: '10000', basis: 'CATALOG_CANDIDATE', sourcePriceId: 'narx-katalog:7' } });
    expect((c as { price: { evidence: string } }).price.evidence).toContain('Tanlash sababi: mos');
  });

  it('AI topa olmasa o‘z iborasi bilan 2-bosqichda qayta qidiriladi; yuborilmagan nomzod tanlanmaydi', async () => {
    const d = draft(false), g = resursGuruhlari(d, calcDoc(d), unitText).filter(x => x.kat === 'МАТ');
    const fake = (id: string): NarxNomzod => ({ id, nom: id === 'k2' ? 'Песок природный' : 'Плита', birlik: 'м3', narx: 1, manba: 'katalog', tur: 'katalog', row: row(Number(id.slice(1)), 'x', 'м3', 1), konversiya: null });
    const calls: string[][] = [];
    const out = await aiNarxlash(g, (_g, ib) => (ib.length ? [fake('k2')] : [fake('k1')]), async s => {
      calls.push(s.flatMap(x => x.nomzodlar.map(n => n.id)));
      return calls.length === 1 ? [{ id: s[0].id, tanlov: null, ishonch: 'past', sabab: 'mos emas', qidiruv: ['Песок природный'] }]
        : [{ id: s[0].id, tanlov: 'k2', ishonch: 'yuqori', sabab: 'ma’nosi mos' }];
    });
    expect(calls).toEqual([['k1'], ['k2']]);
    expect(out[0]).toMatchObject({ ishonch: 'yuqori', nomzod: { id: 'k2' } });
  });
});

describe('RES: tasdiqlangan stavkalar va koeffitsientlar', () => {
  it('stavkalar tasdiqlansa RES ostida tirik nakrutka podvali; ВСЕГО К ОПЛАТЕ JS kaskadiga teng', () => {
    const d = applyCommand(draft(), { type: 'SET_RATES', rates: { values: { ТРАНСПОРТ_МАТЕРИАЛ: 5, СКЛАДСКИЕ_МАТЕРИАЛ: 2, ПРОЧИЕ_ПОДРЯДЧИК: 18, СТРАХОВАНИЕ: 0.32, НДС: 12 }, source: 'Kompaniya sozlamasi' } });
    const r = abcHujjat(d, calcDoc(d), unitText);
    const rows = sheet(r.bytes, 'RES');
    expect(rows.some(x => x.join('|').includes('РАСЧЕТ СТОИМОСТИ (ставки: Kompaniya sozlamasi)'))).toBe(true);
    const ks = Object.fromEntries(NAKRUTKA_KATLAR.map(k => [k, 0])) as Record<(typeof NAKRUTKA_KATLAR)[number], number>;
    for (const x of [...r.groups.labour, ...r.groups.machines, ...[...r.groups.materials.values()].flat()]) if (x.kat && x.amount != null) ks[x.kat] += x.amount;
    const vsego = rows.find(x => x.join('|').includes('ВСЕГО К ОПЛАТЕ'))!;
    expect(num(vsego[7])).toBeCloseTo(nakrutkaKaskadJS(ks, d.rates!.values).vsego, 2);
  });

  it('stavka tasdiqlanmagan bo‘lsa podval yo‘q (nakrutka o‘ylab topilmaydi)', () => {
    const d = draft();
    expect(sheet(abcHujjat(d, calcDoc(d), unitText).bytes, 'RES').some(x => x.join('|').includes('РАСЧЕТ СТОИМОСТИ'))).toBe(false);
  });

  it('qabul qilingan mehnat koeffitsienti faqat mehnat miqdorini oshiradi; taklif hech narsani o‘zgartirmaydi', () => {
    const k = (accepted: boolean): StudioCommand => ({ type: 'SET_COEFFICIENTS', occurrenceId: 'o1', coefficients: [
      { id: 'k1', name: 'Tor sharoit', value: '1.15', scope: 'ЧЕЛ', evidence: 'ShNQ texnik qism (tekshirilsin)', origin: 'AI', accepted }] });
    const base = calcDoc(draft()).occurrences.o1.lines;
    const proposed = calcDoc(applyCommand(draft(), k(false))).occurrences.o1.lines;
    const accepted = calcDoc(applyCommand(draft(), k(true))).occurrences.o1.lines;
    expect(proposed.map(l => l.quantity)).toEqual(base.map(l => l.quantity));
    expect(Number(accepted[0].quantity)).toBeCloseTo(Number(base[0].quantity) * 1.15, 5);
    expect(accepted.slice(1).map(l => l.quantity)).toEqual(base.slice(1).map(l => l.quantity));
    expect(() => applyCommand(draft(), { type: 'SET_COEFFICIENTS', occurrenceId: 'o1', coefficients: [{ id: 'k1', name: 'x', value: '1.1', scope: 'ALL', evidence: '', origin: 'AI', accepted: false }] })).toThrow('COEFFICIENT_EVIDENCE_REQUIRED');
  });
});
