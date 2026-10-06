import { describe, expect, it } from 'vitest';
import { emptyDoc, normDec, type Occurrence, type RecipeSnapshot, type UnitBasis, type WorkSource } from './model';
import { applyCommand, dispatch, historyOf, MAX_SECTION_DEPTH, redo, undo, type StudioCommand } from './commands';
import { calcDoc, calcOccurrence, mulDec } from './calc';
import { suggestedBasis } from './catalog-bridge';

const res = (id: string, name: string) => ({ id, code: 'C' + id, name, unitCode: '005', type: 'M' });
const recipe: RecipeSnapshot[] = [
  { recipeId: 'r1', status: 'EXACT', resource: res('1', 'Бетон B15'), norm: '1.02', candidates: [res('1', 'Бетон B15')], candidateCount: 1, prices: [], priceCount: 0 },
  { recipeId: 'r2', status: 'EXACT', resource: res('2', 'Затраты труда'), norm: '2.5', candidates: [res('2', 'Затраты труда')], candidateCount: 1, prices: [], priceCount: 0 },
  { recipeId: 'r3', status: 'MISSING', resource: null, norm: '0.4', candidates: [], candidateCount: 0, prices: [], priceCount: 0 },
  { recipeId: 'r4', status: 'EXACT', resource: res('4', 'Вода'), norm: null, candidates: [res('4', 'Вода')], candidateCount: 1, prices: [], priceCount: 0 },
];
const source: WorkSource = { catalogRevision: 'a52b8b04f03b94fd', workId: '10', code: 'E6-1-1', name: 'Бетон фундамента', unitCode: '003', tableLabel: null };
const basis: UnitBasis = { scale: '1', unitLabel: 'м3', evidence: 'KodI 003 observed', origin: 'OBSERVED' };
const run = (...cmds: StudioCommand[]) => cmds.reduce(applyCommand, emptyDoc('d1'));
const base = (): StudioCommand[] => [
  { type: 'ADD_SECTION', sectionId: 's1', parentId: null, name: 'FM-1 fundament' },
  { type: 'ADD_SECTION', sectionId: 's2', parentId: 's1', name: 'Beton ishlari' },
  { type: 'ADD_OCCURRENCE', occurrenceId: 'o1', sectionId: 's2', source, recipe, quantity: '15', basis },
];

describe('decimal input', () => {
  it.each([['4', '4'], ['4,5', '4.5'], ['004.500', '4.5'], ['0', '0']])('%s → %s', (a, b) => expect(normDec(a)).toBe(b));
  it.each(['-1', 'abc', '', '1e3', '1.2.3'])('rejects %s', v => expect(() => normDec(v)).toThrow());
  it('exact product', () => { expect(mulDec('1.02', '15')).toBe('15.30'); expect(mulDec('0.001', '0.5')).toBe('0.0005'); });
});

describe('command layer — sections and occurrences', () => {
  it('deep hierarchy up to MAX_SECTION_DEPTH; non-empty section cannot be removed', () => {
    const d = run(...base());
    expect(d.rootOrder).toEqual(['s1']); expect(d.sections.s1.children).toEqual(['s2']);
    expect(applyCommand(d, { type: 'ADD_SECTION', sectionId: 's3', parentId: 's2', name: 'x' }).sections.s2.children).toEqual(['s3']);
    expect(() => applyCommand(d, { type: 'REMOVE_SECTION', sectionId: 's2' })).toThrow('SECTION_NOT_EMPTY');
    expect(() => applyCommand(d, { type: 'ADD_SECTION', sectionId: 's9', parentId: null, name: '  ' })).toThrow('SECTION_NAME_REQUIRED');
  });
  it('same catalogue work in two sections = two independent occurrences', () => {
    let d = run(...base(), { type: 'ADD_SECTION', sectionId: 's4', parentId: null, name: 'FM-2' },
      { type: 'ADD_OCCURRENCE', occurrenceId: 'o2', sectionId: 's4', source, recipe, quantity: '7', basis });
    expect(d.occurrences.o1.source.workId).toBe(d.occurrences.o2.source.workId);
    d = applyCommand(d, { type: 'REMOVE_OCCURRENCE', occurrenceId: 'o1' });
    expect(d.occurrences.o2.quantity).toBe('7'); expect(d.sections.s2.items).toEqual([]);
  });
  it('recipe snapshot is frozen: mutating the input after add does not change the draft', () => {
    const r = structuredClone(recipe); const d = run(...base().slice(0, 2), { type: 'ADD_OCCURRENCE', occurrenceId: 'o1', sectionId: 's2', source, recipe: r, quantity: '1', basis });
    r[0].norm = '99'; expect(d.occurrences.o1.recipe[0].norm).toBe('1.02');
  });
  it('move between sections keeps quantity and overrides', () => {
    let d = run(...base(), { type: 'ADD_SECTION', sectionId: 's4', parentId: null, name: 'FM-2' },
      { type: 'SET_PRICE', occurrenceId: 'o1', recipeId: 'r1', price: { value: '700000', basis: 'CONTRACT_DRAFT', evidence: 'Shartnoma 12', sourcePriceId: null } });
    d = applyCommand(d, { type: 'MOVE_OCCURRENCE', occurrenceId: 'o1', sectionId: 's4' });
    expect(d.sections.s4.items).toEqual(['o1']); expect(d.occurrences.o1.sectionId).toBe('s4');
    expect(d.occurrences.o1.overrides.r1.price?.value).toBe('700000');
  });
  it('basis needs evidence; zero scale invalid; unknown basis allowed but unconfirmed', () => {
    const d = run(...base());
    expect(() => applyCommand(d, { type: 'SET_BASIS', occurrenceId: 'o1', basis: { scale: '100', unitLabel: 'м2', evidence: ' ', origin: 'OPERATOR' } })).toThrow('BASIS_EVIDENCE_REQUIRED');
    expect(() => applyCommand(d, { type: 'SET_BASIS', occurrenceId: 'o1', basis: { scale: '0', unitLabel: 'м2', evidence: 'x', origin: 'OPERATOR' } })).toThrow('BASIS_INVALID');
    const u = applyCommand(d, { type: 'SET_BASIS', occurrenceId: 'o1', basis: { scale: null, unitLabel: null, evidence: null, origin: null } });
    expect(calcOccurrence(u.occurrences.o1).issues).toContain('BASIS_UNCONFIRMED');
  });
  it('price requires evidence and a known basis kind', () => {
    const d = run(...base());
    expect(() => applyCommand(d, { type: 'SET_PRICE', occurrenceId: 'o1', recipeId: 'r1', price: { value: '1', basis: 'CONTRACT_DRAFT', evidence: '', sourcePriceId: null } })).toThrow('PRICE_EVIDENCE_REQUIRED');
    expect(() => applyCommand(d, { type: 'SET_PRICE', occurrenceId: 'o1', recipeId: 'r1', price: { value: '1', basis: 'CERTIFIED_F2' as never, evidence: 'x', sourcePriceId: null } })).toThrow('PRICE_BASIS_INVALID');
    expect(() => applyCommand(d, { type: 'SET_PRICE', occurrenceId: 'o1', recipeId: 'nope', price: null })).toThrow('RECIPE_NOT_FOUND');
  });
});

describe('calculation — NULL is never zero', () => {
  it('quantity × norm ÷ scale; unknown price keeps total unknown but shows known part', () => {
    let d = run(...base(), { type: 'SET_PRICE', occurrenceId: 'o1', recipeId: 'r1', price: { value: '700000', basis: 'CONTRACT_DRAFT', evidence: 'Shartnoma 12', sourcePriceId: null } });
    let c = calcDoc(d);
    const o = c.occurrences.o1;
    expect(o.lines[0]).toMatchObject({ quantity: '15.300000', amount: '10710000.00' });
    expect(o.lines[1]).toMatchObject({ quantity: '37.500000', amount: null, issues: ['PRICE_MISSING'] });
    expect(o.lines[2].issues).toContain('RESOURCE_UNRESOLVED'); expect(o.lines[2].quantity).toBeNull();
    expect(o.lines[3].issues).toContain('NORM_UNKNOWN'); expect(o.lines[3].quantity).toBeNull();
    expect(o).toMatchObject({ amount: null, knownAmount: '10710000.00', unresolved: 3 });
    expect(c.sections.s1).toMatchObject({ amount: null, knownAmount: '10710000.00', unresolved: 3 });
    // Resolve everything → exact total.
    d = applyCommand(d, { type: 'SET_PRICE', occurrenceId: 'o1', recipeId: 'r2', price: { value: '25000', basis: 'OPERATOR_MANUAL', evidence: 'Chel.-soat 2026 Q2', sourcePriceId: null } });
    d = applyCommand(d, { type: 'SUBSTITUTE_RESOURCE', occurrenceId: 'o1', recipeId: 'r3', substitution: { resource: res('9', 'Арматура A500C d12'), reason: 'Loyiha bo‘yicha', conversion: '1', conversionEvidence: null, normOverride: null } });
    d = applyCommand(d, { type: 'SET_PRICE', occurrenceId: 'o1', recipeId: 'r3', price: { value: '9000000', basis: 'PROCUREMENT_ACTUAL', evidence: 'Hisob-faktura 77', sourcePriceId: null } });
    d = applyCommand(d, { type: 'SUBSTITUTE_RESOURCE', occurrenceId: 'o1', recipeId: 'r4', substitution: { resource: res('4', 'Вода'), reason: 'Norma loyihadan', conversion: '1', conversionEvidence: null, normOverride: { value: '0.3', evidence: 'Loyiha PZ 4.2' } } });
    d = applyCommand(d, { type: 'SET_PRICE', occurrenceId: 'o1', recipeId: 'r4', price: { value: '5000', basis: 'OPERATOR_MANUAL', evidence: 'Suv tarifi', sourcePriceId: null } });
    c = calcDoc(d);
    // 15.3×700000 + 37.5×25000 + 6.0×9000000 + 4.5×5000
    expect(c.total).toEqual({ amount: '65670000.00', knownAmount: '65670000.00', unresolved: 0 });
    expect(d.occurrences.o1.recipe[3].norm).toBeNull(); // original source NULL preserved next to override
  });
  it('substitution clears the old price and non-1 conversion needs evidence', () => {
    let d = run(...base(), { type: 'SET_PRICE', occurrenceId: 'o1', recipeId: 'r1', price: { value: '700000', basis: 'CONTRACT_DRAFT', evidence: 'x', sourcePriceId: null } });
    expect(() => applyCommand(d, { type: 'SUBSTITUTE_RESOURCE', occurrenceId: 'o1', recipeId: 'r1', substitution: { resource: res('7', 'Бетон B20'), reason: 'Loyiha', conversion: '2.4', conversionEvidence: null, normOverride: null } })).toThrow('CONVERSION_EVIDENCE_REQUIRED');
    d = applyCommand(d, { type: 'SUBSTITUTE_RESOURCE', occurrenceId: 'o1', recipeId: 'r1', substitution: { resource: res('7', 'Бетон B20'), reason: 'Loyiha', conversion: '2.4', conversionEvidence: 'zichlik 2.4 t/m3', normOverride: null } });
    const line = calcDoc(d).occurrences.o1.lines[0];
    expect(line).toMatchObject({ substituted: true, quantity: '36.720000', price: null, amount: null });
    expect(line.original?.name).toBe('Бетон B15'); expect(line.resource?.name).toBe('Бетон B20');
  });
  it('work without recipe is unknown, not zero', () => {
    const d = run(...base().slice(0, 2), { type: 'ADD_OCCURRENCE', occurrenceId: 'o9', sectionId: 's2', source, recipe: [], quantity: '1', basis });
    expect(calcDoc(d).total).toEqual({ amount: null, knownAmount: '0.00', unresolved: 1 });
  });
});

describe('undo/redo', () => {
  it('failed command does not enter history; undo/redo restore exact documents', () => {
    let h = historyOf(emptyDoc('d1'));
    for (const c of base()) h = dispatch(h, c);
    expect(() => dispatch(h, { type: 'SET_QUANTITY', occurrenceId: 'o1', quantity: '-5' })).toThrow('QUANTITY_INVALID');
    h = dispatch(h, { type: 'SET_QUANTITY', occurrenceId: 'o1', quantity: '20' });
    h = undo(h); expect(h.present.occurrences.o1.quantity).toBe('15');
    h = redo(h); expect(h.present.occurrences.o1.quantity).toBe('20');
    h = undo(undo(undo(undo(h)))); expect(h.present.rootOrder).toEqual([]);
    expect(undo(h)).toBe(h);
  });
});

describe('observed unit basis', () => {
  it('only OBSERVED entry yields a basis, with evidence text', () => {
    expect(suggestedBasis('007', { text: '100М3', scale: '100', base: 'м3', observations: 1414, status: 'OBSERVED', variants: [] }))
      .toMatchObject({ scale: '100', unitLabel: 'м3', origin: 'OBSERVED' });
    expect(suggestedBasis('007', null)).toEqual({ scale: null, unitLabel: null, evidence: null, origin: null });
    expect(suggestedBasis('007', { text: '', scale: null, base: null, observations: 3, status: 'CONFLICT', variants: [] }).scale).toBeNull();
  });
});

describe('command layer — deep hierarchy and copy-on-write', () => {
  const chain = (n: number) => Array.from({ length: n }, (_, i): StudioCommand => ({ type: 'ADD_SECTION', sectionId: 'k' + i, parentId: i ? 'k' + (i - 1) : null, name: 'Daraja ' + (i + 1) }));
  it('nests to MAX_SECTION_DEPTH and refuses one level more', () => {
    const d = run(...chain(MAX_SECTION_DEPTH));
    expect(() => applyCommand(d, { type: 'ADD_SECTION', sectionId: 'x', parentId: 'k' + (MAX_SECTION_DEPTH - 1), name: 'x' })).toThrow('SECTION_DEPTH_LIMIT');
  });
  it('MOVE_SECTION re-parents with index; cannot move into own descendant; depth checked for the whole subtree', () => {
    let d = run(...base(), { type: 'ADD_SECTION', sectionId: 's4', parentId: null, name: 'FM-2' });
    expect(() => applyCommand(d, { type: 'MOVE_SECTION', sectionId: 's1', parentId: 's2' })).toThrow('SECTION_CYCLE');
    expect(() => applyCommand(d, { type: 'MOVE_SECTION', sectionId: 's1', parentId: 's1' })).toThrow('SECTION_CYCLE');
    d = applyCommand(d, { type: 'MOVE_SECTION', sectionId: 's2', parentId: 's4', index: 0 });
    expect(d.sections.s4.children).toEqual(['s2']); expect(d.sections.s1.children).toEqual([]); expect(d.sections.s2.parentId).toBe('s4');
    expect(calcDoc(d).sections.s4.knownAmount).toBe(calcDoc(d).sections.s2.knownAmount);
    d = applyCommand(d, { type: 'MOVE_SECTION', sectionId: 's2', parentId: null, index: 0 });
    expect(d.rootOrder).toEqual(['s2', 's1', 's4']);
    const deep = run(...chain(MAX_SECTION_DEPTH - 1), { type: 'ADD_SECTION', sectionId: 'a', parentId: null, name: 'a' }, { type: 'ADD_SECTION', sectionId: 'b', parentId: 'a', name: 'b' });
    expect(() => applyCommand(deep, { type: 'MOVE_SECTION', sectionId: 'a', parentId: 'k' + (MAX_SECTION_DEPTH - 2) })).toThrow('SECTION_DEPTH_LIMIT');
  });
  it('input document is never mutated and untouched entities are shared (cheap undo)', () => {
    const d = run(...base(), { type: 'ADD_SECTION', sectionId: 's4', parentId: null, name: 'FM-2' });
    const frozen = JSON.stringify(d);
    const n = applyCommand(d, { type: 'SET_QUANTITY', occurrenceId: 'o1', quantity: '20' });
    expect(JSON.stringify(d)).toBe(frozen);
    expect(n.sections).toBe(d.sections); expect(n.occurrences.o1).not.toBe(d.occurrences.o1);
    expect(n.occurrences.o1.recipe).toBe(d.occurrences.o1.recipe);
    const p = applyCommand(n, { type: 'SET_PRICE', occurrenceId: 'o1', recipeId: 'r1', price: { value: '5', basis: 'CONTRACT_DRAFT', evidence: 'x', sourcePriceId: null } });
    expect(n.occurrences.o1.overrides.r1).toBeUndefined(); expect(p.occurrences.o1.overrides.r1.price?.value).toBe('5');
    expect(() => applyCommand(d, { type: 'MOVE_OCCURRENCE', occurrenceId: 'o1', sectionId: 's4', index: 5 })).toThrow('INDEX_INVALID');
    expect(JSON.stringify(d)).toBe(frozen);
  });
  it('30k occurrences: 100 edits with history stay fast (no full-document clone)', () => {
    let d = run({ type: 'ADD_SECTION', sectionId: 'big', parentId: null, name: 'Big' });
    const sec = d.sections.big; const occ: Record<string, Occurrence> = {};
    for (let i = 0; i < 30000; i++) occ['o' + i] = { id: 'o' + i, sectionId: 'big', source, quantity: '1', basis, recipe, overrides: {} };
    d = { ...d, occurrences: occ, sections: { big: { ...sec, items: Object.keys(occ) } } };
    let h = historyOf(d); const t0 = performance.now();
    for (let i = 0; i < 100; i++) h = dispatch(h, { type: 'SET_QUANTITY', occurrenceId: 'o' + i, quantity: String(i + 2) });
    // Wall clock only guards against a full-document clone regression (that took minutes); CI load varies.
    expect(performance.now() - t0).toBeLessThan(25000);
    expect(h.past.length).toBe(100); expect(undo(h).present.occurrences.o99.quantity).toBe('1'); expect(h.present.occurrences.o5000).toBe(d.occurrences.o5000);
  });
});
