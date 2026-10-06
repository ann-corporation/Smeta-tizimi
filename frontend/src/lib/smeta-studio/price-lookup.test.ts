import { describe, expect, it } from 'vitest';
import type { KatalogQatori } from '../narx-katalog/price-remote';
import { birlikKalit, nomKalit } from '../narx-katalog/kalit';
import { emptyDoc, type RecipeSnapshot, type UnitBasis, type WorkSource } from './model';
import { applyCommand, dispatch, historyOf, undo, type StudioCommand } from './commands';
import { calcDoc } from './calc';
import { bulkCommand, bulkProposals, catalogEvidence, findOffers, priceCommand, type PriceSource } from './price-lookup';

const k = (id: number, nom: string, birlik: string, narx: number | null, hudud = 'toshkent'): KatalogQatori => ({
  id, manba_id: 1, kod: 'K' + id, nom, birlik, narx, hudud: hudud === 'toshkent' ? 'Toshkent sh.' : 'Samarqand', ishlab_chiqaruvchi: 'ООО Zavod',
  nds_holati: 'NDS siz', nds_izoh: null, yil: 2026, kvartal: 2, narx_varianti: null, guruh: null, hudud_kalit: hudud,
  manba_nom: 'Platforma katalogi 2026-II', manba_tur: 'platforma' });
const ROWS = [k(1, 'БЕТОН ТЯЖЕЛЫЙ B15', 'м3', 780000), k(2, 'БЕТОН ТЯЖЕЛЫЙ B15', 'м3', 760000, 'samarqand'),
  k(3, 'БЕТОН ТЯЖЕЛЫЙ B25', 'м3', 900000), k(4, 'АРМАТУРА А500С', 'т', 9800000), k(5, 'АРМАТУРА А500С', 'т', null)];
const src: PriceSource = {
  aniqMoslik: (nom, birlik) => ROWS.filter(r => r.narx != null && nomKalit(r.nom) === nomKalit(nom) && birlikKalit(r.birlik) === birlikKalit(birlik)),
  qidir: (m) => ROWS.filter(r => m.toLowerCase().split(/\s+/).every(w => r.nom.toLowerCase().includes(w))),
};
const res = (id: string, name: string, unitCode: string) => ({ id, code: 'C' + id, name, unitCode, type: 'M' });
const recipe: RecipeSnapshot[] = [
  { recipeId: 'r1', status: 'EXACT', resource: res('1', 'Бетон тяжелый B15', '005'), norm: '1.02', candidates: [], candidateCount: 1, prices: [], priceCount: 0 },
  { recipeId: 'r2', status: 'EXACT', resource: res('2', 'Арматура А500С', '007'), norm: '0.08', candidates: [], candidateCount: 1, prices: [], priceCount: 0 },
  { recipeId: 'r3', status: 'EXACT', resource: res('3', 'Вода', '005'), norm: '0.3', candidates: [], candidateCount: 1, prices: [], priceCount: 0 },
];
const units: Record<string, string> = { '005': 'м3', '007': 'т' };
const unitText = (c: string | null) => units[c ?? ''] ?? null;
const source: WorkSource = { catalogRevision: 'rev', workId: 'w', code: 'E6-1', name: 'Бетон', unitCode: '005', tableLabel: null };
const basis: UnitBasis = { scale: '1', unitLabel: 'м3', evidence: 'KodI', origin: 'OBSERVED' };
const doc = () => ([
  { type: 'ADD_SECTION', sectionId: 's', parentId: null, name: 'Fundament' },
  { type: 'ADD_OCCURRENCE', occurrenceId: 'o1', sectionId: 's', source, recipe, quantity: '10', basis },
] as StudioCommand[]).reduce(applyCommand, emptyDoc('d'));

describe('catalogue pricing', () => {
  it('exact name+unit matches first (object region first), then name search; no-price rows skipped', () => {
    const offers = findOffers(src, 'Бетон тяжелый B15', 'м3', 'samarqand');
    expect(offers.map(o => [o.row.id, o.exact])).toEqual([[2, true], [1, true]]);
    expect(findOffers(src, 'АРМАТУРА', 'кг').map(o => [o.row.id, o.exact])).toEqual([[4, false]]);
  });
  it('chosen row → CATALOG_CANDIDATE price with full provenance as evidence', () => {
    const c = priceCommand('o1', 'r1', ROWS[0]);
    expect(c).toMatchObject({ type: 'SET_PRICE', price: { value: '780000', basis: 'CATALOG_CANDIDATE', sourcePriceId: 'narx-katalog:1' } });
    expect(catalogEvidence(ROWS[0])).toBe('Platforma narx katalogi · Platforma katalogi 2026-II · 2026 y. 2-kv. · Toshkent sh. · ООО Zavod · NDS siz · kod K1 · БЕТОН ТЯЖЕЛЫЙ B15, м3');
  });
  it('bulk: one exact (or one in region) is pre-chosen, several left to operator, none listed; applied as ONE undo step', () => {
    const d = doc();
    let p = bulkProposals(d, calcDoc(d), src, unitText);
    expect(p.map(x => [x.recipeId, x.reason])).toEqual([['r1', 'SEVERAL_EXACT'], ['r2', 'ONE_EXACT'], ['r3', 'NONE']]);
    p = bulkProposals(d, calcDoc(d), src, unitText, 'toshkent');
    expect(p[0].chosen?.id).toBe(1);
    const h = dispatch(historyOf(d), bulkCommand(p)!);
    expect(h.present.occurrences.o1.overrides.r1.price?.value).toBe('780000');
    expect(h.present.occurrences.o1.overrides.r2.price?.value).toBe('9800000');
    expect(h.present.edits).toBe(d.edits + 1);
    expect(undo(h).present.occurrences.o1.overrides.r1).toBeUndefined();
  });
  it('batch is all-or-nothing and cannot nest', () => {
    const d = doc();
    const bad: StudioCommand = { type: 'BATCH', label: 'x', commands: [priceCommand('o1', 'r1', ROWS[0]), { type: 'SET_QUANTITY', occurrenceId: 'nope', quantity: '1' }] };
    expect(() => applyCommand(d, bad)).toThrow('OCCURRENCE_NOT_FOUND');
    expect(d.occurrences.o1.overrides.r1).toBeUndefined();
    expect(() => applyCommand(d, { type: 'BATCH', label: 'x', commands: [{ type: 'BATCH', label: 'y', commands: [] }] })).toThrow('BATCH_INVALID');
  });
});
