import { afterEach, describe, expect, it, vi } from 'vitest';
import fixture from './fixtures/catalog-cases.json';
import { createHash } from 'node:crypto';
import { emptyDoc, type Occurrence, type WorkCoefficient } from '../smeta-studio/model';
import { applyCommand, dispatch, historyOf, redo, undo } from '../smeta-studio/commands';
import { calcDoc, calcOccurrence } from '../smeta-studio/calc';
import { studioToRows } from '../smeta-studio/export-adapter';
import { koefgaAylantir } from '../smeta-studio/koef-katalog';
import { imzola } from '../../../functions/_shared/auth';

afterEach(() => vi.unstubAllGlobals());

const material = { id: 'synthetic_material', code: 'TEST_ONLY', name: 'SYNTHETIC MATERIAL', unitCode: '003', type: 'M' };
function occurrence(c = fixture.cases[0]): Occurrence {
  return { id: 'o1', sectionId: 's1', source: { catalogRevision: 'fixture_edition_A', workId: 'synthetic_work', code: 'Е01-01-001-1', name: 'SYNTHETIC WORK', unitCode: '003', tableLabel: null },
    quantity: c.quantity, basis: { scale: c.basis, unitLabel: 'м3', evidence: 'SYNTHETIC 1000 м3', origin: 'OPERATOR' },
    recipe: [{ recipeId: 'r1', status: 'EXACT', resource: material, norm: c.norm, candidates: [material], candidateCount: 1, prices: [], priceCount: 0 }],
    overrides: c.price == null ? {} : { r1: { price: { value: c.price, basis: 'CONTRACT_DRAFT', evidence: 'TEST ARITHMETIC ONLY', sourcePriceId: null } } } };
}
const docFor = (o: Occurrence) => ({ ...emptyDoc('synthetic_draft'), rootOrder: ['s1'], sections: { s1: { id: 's1', name: 'SYNTHETIC', parentId: null, children: [], items: ['o1'] } }, occurrences: { o1: o } });

describe('Catalog adoption acceptance against current Studio engine', () => {
  it.each(fixture.cases)('$id preserves basis, NULL and explicit zero', c => {
    expect(c.edition).toBe('synthetic-arithmetic-v1');
    expect(createHash('sha256').update(c.source_text).digest('hex')).toBe(c.source_sha256);
    const result = calcOccurrence(occurrence(c));
    expect(result.lines[0].quantity).toBe(c.expectedQuantity);
    expect(result.amount).toBe(c.expectedAmount);
  });
  it.each(['MISSING', 'AMBIGUOUS'] as const)('%s recipe never chooses the first candidate', status => {
    const o = occurrence();o.recipe[0] = { ...o.recipe[0], status, resource: null, candidates: status === 'AMBIGUOUS' ? [material, { ...material, id: 'other_resource' }] : [], candidateCount: status === 'AMBIGUOUS' ? 2 : 0 };
    const result = calcOccurrence(o);
    expect(result.amount).toBeNull();expect(result.lines[0].quantity).toBeNull();
    expect(result.lines[0].issues).toContain('RESOURCE_UNRESOLVED');
  });
  it('unconfirmed basis stays unknown, even with known norm and price', () => {
    const o = occurrence();o.basis = { scale: null, unitLabel: null, evidence: null, origin: null };
    expect(calcOccurrence(o)).toMatchObject({ amount: null, unresolved: 1, issues: ['BASIS_UNCONFIRMED'] });
  });
  it('a source without recipes is unknown rather than a free work', () => {
    const o = occurrence();o.recipe = [];
    expect(calcOccurrence(o)).toMatchObject({ amount: null, knownAmount: '0.00', unresolved: 1 });
  });
  it('preview of accepted coefficient, apply, undo and redo leave the source unchanged', () => {
    const o = occurrence(), before = structuredClone(o), doc = docFor(o);
    const coefficient: WorkCoefficient = { id: 'test_coef', name: 'SYNTHETIC', value: '1.2', scope: 'МАТ', evidence: 'TEST ONLY', origin: 'OPERATOR', accepted: false };
    expect(calcOccurrence({ ...o, coefficients: [coefficient] }).amount).toBe('10.00');
    const accepted = { ...coefficient, accepted: true };
    expect(calcOccurrence({ ...o, coefficients: [accepted] }).amount).toBe('12.00');
    const applied = dispatch(historyOf(doc), { type: 'SET_COEFFICIENTS', occurrenceId: 'o1', coefficients: [accepted] });
    expect(calcDoc(applied.present).total.amount).toBe('12.00');
    expect(calcDoc(undo(applied).present).total.amount).toBe('10.00');
    expect(calcDoc(redo(undo(applied)).present).total.amount).toBe('12.00');
    expect(o).toEqual(before);
  });
  it('parameter/additive rule stays non-executable; no 0.005 multiplier invention', () => {
    expect(koefgaAylantir({ kod: 'SYNTHETIC', yozuv: { a: 'TEST ONLY', t: '', s: 'per metre', q: '', k: { ЧЕЛ: 0.005 }, op: 'SHART' } }, true)).toEqual([]);
  });
  it('unknown price stays NULL through draft export; explicit zero stays zero', () => {
    for (const [index, expected] of [[1, null], [2, 0]] as const) {
      const d = docFor(occurrence(fixture.cases[index]));
      const row = studioToRows(d, calcDoc(d)).find(r => r.kod === material.code)!;
      expect(row.narx).toBe(expected);expect(row.summa).toBe(expected);
    }
  });
  it('same code across two source editions keeps separate immutable snapshots', () => {
    const a = occurrence(), b = occurrence();b.id = 'o2';b.source = { ...b.source, catalogRevision: 'fixture_edition_B', workId: 'different_source_id' };b.recipe[0] = { ...b.recipe[0], norm: '8' };
    const d = applyCommand(docFor(a), { type: 'ADD_OCCURRENCE', occurrenceId: b.id, sectionId: 's1', source: b.source, recipe: b.recipe, quantity: b.quantity, basis: b.basis });
    expect(d.occurrences.o1.source.code).toBe(d.occurrences.o2.source.code);
    expect(d.occurrences.o1.source.catalogRevision).not.toBe(d.occurrences.o2.source.catalogRevision);
    b.recipe[0].norm = '999';
    expect(d.occurrences.o1.recipe[0].norm).toBe('4');expect(d.occurrences.o2.recipe[0].norm).toBe('8');
  });
  it('cross-company draft save is refused before any RPC (synthetic session; no live database)', async () => {
    // Keep the Pages handler out of the browser TypeScript project. Its own functions
    // project supplies PagesFunction types; Vitest still executes the real source here.
    const handlerPath = '../../../functions/api/smeta-studio.ts';
    const { onRequestPost } = await import(/* @vite-ignore */ handlerPath);
    const network = vi.fn(() => { throw new Error('NETWORK_MUST_NOT_BE_USED'); });
    vi.stubGlobal('fetch', network);
    const testSigningKey = 'synthetic-fixture-only-signing-key';
    const cookie = 'sess=' + await imzola({ rol: 'pto', foydalanuvchi_id: 900001,
      kompaniyalar: [{ kompaniya_id: 900001, rol: 'pto' }] }, testSigningKey);
    const request = new Request('https://fixture.invalid/api/smeta-studio', { method: 'POST', headers: { Cookie: cookie },
      body: JSON.stringify({ amal: 'saqla', kompaniya_id: 900002, obyekt_id: null,
        draft_uid: '12345678-1234-4234-8234-123456789abc', expected_version: 0,
        operation_id: '12345678-1234-4234-8234-123456789abd', hujjat: docFor(occurrence()) }) });
    const response = await onRequestPost({ request, env: { SESSIYA_KALIT: testSigningKey,
      SUPABASE_URL: 'https://fixture.invalid', SUPABASE_KEY: 'synthetic-not-a-credential' } } as never);
    expect(response.status).toBe(403);expect(network).not.toHaveBeenCalled();
  });
});
