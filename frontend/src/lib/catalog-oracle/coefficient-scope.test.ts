import { describe, expect, it } from 'vitest';
import fixture from './fixtures/construct-scope.json';
import { coefficientGate, parseWorkKey, scopeCandidates, sourceLookup } from './coefficient-scope';
import { ishKoeffitsientlari, jadvalKalitlari, type KoefKatalog } from '../smeta-studio/koef-katalog';

describe('Construct source scope oracle (reference only)', () => {
  it.each(fixture.cases)('$work_key matches independently recorded installed-core response', c => {
    const ids = scopeCandidates(c.work_key, fixture.rules, fixture.scopes);
    expect(ids).toEqual(c.rule_ids);
    const actual = ids.map(id => {
      const r = fixture.rules.find(x => x.rule_id === id)!;
      return { code: `${r.collection_code}-${r.code}`, title: r.title, basis: r.basis, labour: r.labour, machines: r.machines, materials: r.materials, library: true };
    });
    expect(actual).toEqual(c.core_records);
  });
  it('all fixtures retain source hashes and zero approval; no customer estimate data', () => {
    expect(fixture.source_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(fixture.core_oracle_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(fixture.reference_only).toBe(true);
    expect(fixture.rules.every(r => r.calculation_approved === 0)).toBe(true);
    expect(fixture.cases.every(c => c.source_sha256 === fixture.source_sha256 && c.edition === 'Construct 2.7.3 / audit-20261021')).toBe(true);
  });
  it('UNKNOWN_WORK is distinct from NO_SOURCE_CANDIDATES', () => {
    const known = fixture.cases.map(c => c.work_key), empty = fixture.cases.find(c => !c.rule_ids.length)!;
    expect(sourceLookup(empty.work_key, known, fixture.rules, fixture.scopes).status).toBe('NO_SOURCE_CANDIDATES');
    expect(sourceLookup('Е99-99-999-999', known, fixture.rules, fixture.scopes).status).toBe('UNKNOWN_WORK');
  });
  it.each([
    { condition: null, factors: [1.2], operation: 'MUL' as const },
    { condition: '   ', factors: [1.2], operation: 'MUL' as const },
    { condition: 'TEST', factors: [0], operation: 'MUL' as const },
    { condition: 'TEST', factors: [null], operation: 'MUL' as const },
    { condition: 'TEST', factors: [0.005], operation: 'ADDITIVE' as const },
    { condition: 'TEST', factors: [1.2], operation: 'UNKNOWN' as const },
  ])('no multiplication granted for unresolved condition/zero/operation: %o', patch => {
    expect(coefficientGate({ conditionConfirmed: true, sourceApproved: true, ...patch }).canApply).toBe(false);
  });
  it('scope alone is insufficient even for positive multipliers', () => {
    expect(coefficientGate({ operation: 'MUL', condition: 'TEST', conditionConfirmed: false, sourceApproved: true, factors: [1.2] }).canApply).toBe(false);
    expect(coefficientGate({ operation: 'MUL', condition: 'TEST', conditionConfirmed: true, sourceApproved: false, factors: [1.2] }).canApply).toBe(false);
  });
  it('inclusive boundaries use original source values; no n_from=0 to coefficient-zero inference', () => {
    const scope = fixture.scopes.find(s => s.n_from > 1 && s.n_to > s.n_from)!;
    expect(scope).toBeDefined();
    const rule = fixture.rules.find(r => r.rule_id === scope.rule_id)!;
    const key = (n: number) => `${rule.kind}${rule.collection_code}-${scope.otdel}-${scope.tbl}-${n}`;
    expect(scopeCandidates(key(scope.n_from - 1), [rule], [scope])).toEqual([]);
    expect(scopeCandidates(key(scope.n_from), [rule], [scope])).toEqual([rule.rule_id]);
    expect(scopeCandidates(key(scope.n_to), [rule], [scope])).toEqual([rule.rule_id]);
    expect(scopeCandidates(key(scope.n_to + 1), [rule], [scope])).toEqual([]);
  });
  it('wildcard stays inside family and collection; duplicated targets return one candidate', () => {
    const scope = fixture.scopes.find(s => s.otdel === '*')!;
    const rule = fixture.rules.find(r => r.rule_id === scope.rule_id)!;
    const key = `${rule.kind}${rule.collection_code}-99-999-99`;
    expect(scopeCandidates(key, [rule], [scope, scope])).toEqual([rule.rule_id]);
    const otherFamily = rule.kind === 'Ц' ? 'Е' : 'Ц';
    expect(scopeCandidates(`${otherFamily}${rule.collection_code}-99-999-99`, [rule], [scope])).toEqual([]);
    expect(scopeCandidates(`${rule.kind}99-99-999-99`, [rule], [scope])).toEqual([]);
  });
  it('n_from=0 leaves norm number unrestricted but keeps section/table', () => {
    const scope = fixture.scopes.find(s => s.n_from === 0 && s.otdel !== '*')!;
    const rule = fixture.rules.find(r => r.rule_id === scope.rule_id)!;
    expect(scopeCandidates(`${rule.kind}${rule.collection_code}-${scope.otdel}-${scope.tbl}-999`, [rule], [scope])).toEqual([rule.rule_id]);
    expect(scopeCandidates(`${rule.kind}${rule.collection_code}-99-999-999`, [rule], [scope])).toEqual([]);
  });
  it.each(['01-01-001-1', 'Е01-01-001', 'Е01-01-001-1junk', '../Е01-01-001-1', 'Е01-01-001-1\n'])('rejects incomplete/foreign key %j', key => {
    expect(parseWorkKey(key)).toBeNull();
  });
});

describe('Studio adapter gap regressions — fixed in owner-authorized release', () => {
  it('GAP-COEF-001: trailing garbage cannot match a valid table', () => {
    expect(jadvalKalitlari('Е01-01-001-1junk')).toEqual([]);
  });
  it('GAP-COEF-002: a row-limited rule cannot match a table-only code', () => {
    const kat: KoefKatalog = { schema: 'koef-katalog-v1', manba: 'SYNTHETIC', jadval: { '1-1-1': ['test'] },
      koef: { test: { a: 'SYNTHETIC', t: '', s: '', q: '', k: { ЧЕЛ: 1.1 }, jt: [{ s: 1, t1: 1, t2: 1, r: [[2, 3]] }] } } };
    expect(ishKoeffitsientlari(kat, 'Е1-1-1')).toHaveLength(0);
    expect(ishKoeffitsientlari(kat, 'Е1-1-1-1')).toHaveLength(0);
  });
});
