import { describe, expect, it } from 'vitest';
import { lrvHujjat } from '../lrv-hujjat';
import { hujjatTekshir } from '../hujjat-yozuvchi';
import { emptyDoc, type RecipeSnapshot, type UnitBasis, type WorkSource } from './model';
import { applyCommand, type StudioCommand } from './commands';
import { calcDoc } from './calc';
import { resourceCategory, studioToRows } from './export-adapter';

const res = (id: string, name: string, type: string, unitCode = '005') => ({ id, code: 'C' + id, name, unitCode, type });
const recipe: RecipeSnapshot[] = [
  { recipeId: 'r1', status: 'EXACT', resource: res('1', 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'R', '001'), norm: '2.5', candidates: [], candidateCount: 1, prices: [], priceCount: 0 },
  { recipeId: 'r2', status: 'EXACT', resource: res('2', 'КРАНЫ НА АВТОМОБИЛЬНОМ ХОДУ 10 Т', 'X', '011'), norm: '0.12', candidates: [], candidateCount: 1, prices: [], priceCount: 0 },
  { recipeId: 'r3', status: 'EXACT', resource: res('3', 'БЕТОН ТЯЖЕЛЫЙ B15', 'M'), norm: '102', candidates: [], candidateCount: 1, prices: [], priceCount: 0 },
];
const source: WorkSource = { catalogRevision: 'rev', workId: 'w1', code: 'E6-1-1', name: 'Бетон фундамента', unitCode: '003', tableLabel: null };
const basis: UnitBasis = { scale: '100', unitLabel: 'м3', evidence: 'KodI 003 = 100 м3', origin: 'OBSERVED' };
const price = (occurrenceId: string, recipeId: string, value: string): StudioCommand =>
  ({ type: 'SET_PRICE', occurrenceId, recipeId, price: { value, basis: 'CONTRACT_DRAFT', evidence: 'Shartnoma 1', sourcePriceId: null } });
const units: Record<string, string> = { '001': 'чел.-ч', '005': 'м3', '011': 'маш.-ч', '003': '100 м3' };

function draft() {
  return ([
    { type: 'SET_CONTEXT', context: { objectLabel: 'Karting', title: 'Smeta 1' } },
    { type: 'ADD_SECTION', sectionId: 'a', parentId: null, name: 'Fundament' },
    { type: 'ADD_SECTION', sectionId: 'b', parentId: 'a', name: 'Beton' },
    { type: 'ADD_SECTION', sectionId: 'c', parentId: 'b', name: 'Rostverk' },
    { type: 'ADD_OCCURRENCE', occurrenceId: 'o1', sectionId: 'c', source, recipe, quantity: '15', basis },
    price('o1', 'r1', '25000'), price('o1', 'r2', '410000.5'), price('o1', 'r3', '780000'),
  ] as StudioCommand[]).reduce(applyCommand, emptyDoc('d1'));
}

describe('studio → smeta rows → LRV / Ведомость ресурсов / Свод', () => {
  it('categories from the observed unit first (Tip=R also contains machines); operators stay with machines', () => {
    expect(resourceCategory(res('1', 'ЗАТРАТЫ ТРУДА РАБОЧИХ', 'R', '001'))).toBe('ЧЕЛ');
    expect(resourceCategory(res('1', 'ЗАТРАТЫ ТРУДА МАШИНИСТОВ', 'R', '001'))).toBe('МАШ');
    expect(resourceCategory(res('1', 'ЭКСКАВАТОРЫ ОДНОКОВШОВЫЕ', 'R', '011'))).toBe('МАШ');
    expect(resourceCategory(res('1', 'КРАН', 'X', '011'))).toBe('МАШ');
    expect(resourceCategory(res('1', 'БЕТОН', 'M', '003'))).toBe('МАТ');
    expect(resourceCategory(res('1', 'ЭКСКАВАТОР', 'R', '003'))).toBeNull();
    expect(resourceCategory(res('1', '?', '', '999'))).toBeNull();
  });

  it('keeps the deep hierarchy and per-unit norm; LRV total equals the studio total to the tiyin', () => {
    const d = draft(), c = calcDoc(d);
    const rows = studioToRows(d, c, code => units[code ?? ''] ?? code);
    expect(rows.map(r => r.tur)).toEqual(['rz', 'rz', 'rz', 'bl', 'rs', 'rs', 'mat']);
    expect(rows[2].ota_id).toBe(rows[1].id); expect(rows[3].ota_id).toBe(rows[2].id);
    expect(rows[4]).toMatchObject({ kat: 'ЧЕЛ', birlik: 'чел.-ч', norma: 0.025, hajm: 0.375, narx: 25000 });
    expect(rows[5].kat).toBe('МАШ');
    const r = lrvHujjat(rows, [], { obyektNom: 'Karting' });
    expect(c.total.amount).not.toBeNull();
    expect(r.jami).toBe(Number(c.total.amount));
    const t = hujjatTekshir(r.bytes, { ruxsat: [/^(rz|bl|rs|mat|ob)$/, /^Р\d+$/, /^\d+:[0-9a-z]+$/] });
    expect(t.varaqlar.map(v => v.nom)).toEqual(['LRV', 'Ведомость ресурсов', 'Свод', 'Сводная', 'Данные']);
  });

  it('missing price or quantity: only that line is blank, the LRV total is the sum of the known lines (owner rule)', () => {
    let d = draft();
    const toliq = lrvHujjat(studioToRows(d, calcDoc(d)), [], { obyektNom: 'K' }).jami!;
    d = applyCommand(d, { type: 'SET_PRICE', occurrenceId: 'o1', recipeId: 'r3', price: null });
    const qisman = lrvHujjat(studioToRows(d, calcDoc(d)), [], { obyektNom: 'K' }).jami!;
    expect(qisman).toBeLessThan(toliq);
    expect(qisman).toBeGreaterThanOrEqual(0);
    d = applyCommand(draft(), { type: 'SET_QUANTITY', occurrenceId: 'o1', quantity: null });
    const rows = studioToRows(d, calcDoc(d));
    expect(rows.filter(r => r.tur !== 'rz' && r.tur !== 'bl').every(r => r.hajm == null && r.narx == null)).toBe(true);
    expect(lrvHujjat(rows, [], { obyektNom: 'K' }).jami).toBe(0);
  });
});
