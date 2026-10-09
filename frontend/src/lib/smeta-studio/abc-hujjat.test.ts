import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { emptyDoc, type RecipeSnapshot, type UnitBasis, type WorkSource } from './model';
import { applyCommand, type StudioCommand } from './commands';
import { calcDoc } from './calc';
import { abcHujjat, materialGroup } from './abc-hujjat';

const res = (id: string, kodr: string, code: string, name: string, type: string, unitCode: string) =>
  ({ id, code, resourceIdCode: kodr, name, unitCode, type });
const recipe: RecipeSnapshot[] = [
  { recipeId: 'r1', status: 'EXACT', resource: res('1', '000001', 'С001-1', 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'R', '001'), norm: '5.02', candidates: [], candidateCount: 1, prices: [], priceCount: 0 },
  { recipeId: 'r2', status: 'EXACT', resource: res('2', '000003', 'С001-3', 'ЗАТРАТЫ ТРУДА МАШИНИСТОВ', 'R', '001'), norm: '21.18', candidates: [], candidateCount: 1, prices: [], priceCount: 0 },
  { recipeId: 'r3', status: 'EXACT', resource: res('3', '001942', 'С207-149', 'ЭКСКАВАТОРЫ НА ГУСЕНИЧНОМ ХОДУ', 'X', '011'), norm: '10.59', candidates: [], candidateCount: 1, prices: [], priceCount: 0 },
  { recipeId: 'r4', status: 'EXACT', resource: res('4', '012303', 'С140-12303', 'СМЕСЬ ПЕСЧАНО-ГРАВИЙНАЯ ПРИРОДНАЯ', 'M', '003'), norm: '120', candidates: [], candidateCount: 1, prices: [], priceCount: 0 },
  { recipeId: 'r5', status: 'EXACT', resource: res('5', '035377', 'С111-9004', 'ЭЛЕКТРОДЫ ДИАМЕТРОМ 4 ММ Э42А', 'M', '005'), norm: '2', candidates: [], candidateCount: 1, prices: [], priceCount: 0 },
];
const units: Record<string, string> = { '001': 'чел-ч', '011': 'маш-ч', '003': 'м3', '005': 'кг', '015': '1000 м3' };
const unitText = (c: string | null) => units[c ?? ''] ?? null;
const source: WorkSource = { catalogRevision: 'rev', workId: 'w', code: 'E1-1-195-20', name: 'РАЗРАБОТКА ГРУНТА В ОТВАЛ ЭКСКАВАТОРАМИ', unitCode: '015', tableLabel: null };
const basis: UnitBasis = { scale: '1000', unitLabel: 'м3', evidence: 'KodI 015 = 1000 м3', origin: 'OBSERVED' };
const price = (recipeId: string, value: string): StudioCommand => ({ type: 'SET_PRICE', occurrenceId: 'o1', recipeId, price: { value, basis: 'CONTRACT_DRAFT', evidence: 'x', sourcePriceId: null } });
const draft = (priced = true) => ([
  { type: 'SET_CONTEXT', context: { objectLabel: 'Stella', title: 'Smeta 01-01' } },
  { type: 'ADD_SECTION', sectionId: 's', parentId: null, name: 'СТЕЛЛА' },
  { type: 'ADD_SECTION', sectionId: 'k', parentId: 's', name: 'ЗЕМЛЯНЫЕ РАБОТЫ(КР-3)' },
  { type: 'ADD_OCCURRENCE', occurrenceId: 'o1', sectionId: 'k', source, recipe, quantity: '2529.9', basis },
  ...(priced ? [price('r1', '25000'), price('r2', '30000'), price('r3', '410000'), price('r4', '90000'), price('r5', '18000')] : [price('r1', '25000')]),
] as StudioCommand[]).reduce(applyCommand, emptyDoc('d'));
const sheet = (bytes: Uint8Array, name: string) => XLSX.utils.sheet_to_json<string[]>(XLSX.read(bytes).Sheets[name], { header: 1, raw: false, defval: '' });

describe('ABC-shaped LRV + RES', () => {
  it('material sub-groups follow the price-collection code', () => {
    expect(materialGroup(res('1', '', 'С140-12303', '', 'M', ''))).toBe('ИНЕРТНЫЕ МАТЕРИАЛЫ');
    expect(materialGroup(res('1', '', 'С121-1', '', 'M', ''))).toBe('МЕТАЛЛОКОНСТРУКЦИИ');
    expect(materialGroup(res('1', '', 'С157-1', '', 'M', ''))).toBe('КАБЕЛЬНАЯ ПРОДУКЦИЯ');
    expect(materialGroup(res('1', '', 'С111-9004', '', 'M', ''))).toBe('МЕСТНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ');
  });

  it('LRV: РАЗДЕЛ rows, work «1» in normative units, resources «1.1…» with KodR, norm and project quantity', () => {
    const d = draft(), r = abcHujjat(d, calcDoc(d), unitText);
    expect(XLSX.read(r.bytes).SheetNames).toEqual(['LRV', 'RES']);
    const rows = sheet(r.bytes, 'LRV');
    const flat = rows.map(x => x.join('|'));
    expect(flat.some(x => x.includes('ЛОКАЛЬНАЯ РЕСУРСНАЯ ВЕДОМОСТЬ'))).toBe(true);
    expect(flat.some(x => x.startsWith('РАЗДЕЛ: СТЕЛЛА'))).toBe(true);
    // Owner: LRV carries quantities only — no price columns (prices live in RES).
    expect(flat.some(x => /СТОИМОСТЬ|ЦЕНА|СУММА|ИТОГО/.test(x))).toBe(false);
    expect(Math.max(...rows.map(x => x.length))).toBeLessThanOrEqual(6);
    const w = rows.find(x => x[1] === 'E1-1-195-20')!;
    expect([w[0], w[3]]).toEqual(['1', '1000 м3']);
    expect(Number(String(w[4]).replace(',', '.'))).toBeCloseTo(2.5299, 6);
    const r1 = rows.find(x => x[0] === '1.1')!;
    expect([r1[1], r1[2], r1[3]]).toEqual(['000001', 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'чел-ч']);
    expect(Number(String(r1[5]).replace(/\s/g, '').replace(',', '.'))).toBeCloseTo(12.700098, 5);
  });

  it('RES: labour / machines (with operators) / materials sub-groups; ВСЕГО equals the studio total', () => {
    const d = draft(), c = calcDoc(d), r = abcHujjat(d, c, unitText);
    const flat = sheet(r.bytes, 'RES').map(x => x.join('|'));
    const order = ['ТРУДОВЫЕ РЕСУРСЫ', 'СТРОИТЕЛЬНЫЕ МАШИНЫ И МЕХАНИЗМЫ', 'СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ', 'МЕСТНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ', 'ИНЕРТНЫЕ МАТЕРИАЛЫ']
      .map(t => flat.findIndex(x => x.startsWith(t)));
    expect(order.every((v, i) => v > 0 && (i === 0 || v > order[i - 1]))).toBe(true);
    expect(r.groups.labour.map(x => x.code)).toEqual(['000001']);
    expect(r.groups.machines.map(x => x.code).sort()).toEqual(['000003', '001942']);
    const total = flat.filter(x => x.includes('|ВСЕГО|')).pop()!;
    expect(Number(total.split('|').pop()!.replace(/[\s,]/g, ''))).toBeCloseTo(Number(c.total.amount), 2);
  });

  it('missing prices: only those lines are blank, totals stay visible, each line is listed (owner rule 2026-10-08)', () => {
    const d = draft(false), r = abcHujjat(d, calcDoc(d), unitText);
    const flat = sheet(r.bytes, 'RES').map(x => x.join('|'));
    expect(flat.filter(x => x.includes('|ВСЕГО|')).pop()!.split('|').pop()).not.toBe('');
    expect(flat.some(x => x.includes('цена не указана'))).toBe(true);
    expect(flat.some(x => x.includes('СТАТУС РАСЧЁТА') && x.includes('НЕПОЛНЫЙ'))).toBe(true);
    expect(flat.some(x => x.includes('ПРЯМЫЕ ЗАТРАТЫ (ИЗВЕСТНАЯ ЧАСТЬ)'))).toBe(true);
    expect(flat.some(x => x.includes('не определено'))).toBe(false);
  });
});
