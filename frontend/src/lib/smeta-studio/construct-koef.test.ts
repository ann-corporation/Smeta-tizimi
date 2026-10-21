import { describe, expect, it } from 'vitest';
import fixture from '../catalog-oracle/fixtures/construct-scope.json';
import { CONSTRUCT_REFERENCE, constructCandidates, constructWorkKey, loadConstructCandidates, type ConstructPayload } from './construct-koef';
const payload: ConstructPayload = { schema: 'construct-coefficient-reference-v1', source_sha256: CONSTRUCT_REFERENCE.sourceSha256,
  calculation_approved: false, works: fixture.cases.map(c => c.work_key), rules: fixture.rules, scopes: fixture.scopes };
describe('Construct R2 reference adapter', () => {
  it.each(fixture.cases)('$work_key matches recorded installed core without granting execution', c => {
    const result = constructCandidates(payload, c.work_key, 100);
    expect(result.candidates.map(c => c.rule.rule_id)).toEqual(c.rule_ids);
    expect(result.canApply).toBe(false);
    expect(result.sourceSha256).toBe(CONSTRUCT_REFERENCE.sourceSha256);
    expect(result.edition).toContain('2.7.3');
  });
  it('distinguishes an unknown work from a known work with no source candidates', () => {
    const empty = fixture.cases.find(c => !c.rule_ids.length)!;
    expect(constructCandidates(payload, empty.work_key).status).toBe('NO_SOURCE_CANDIDATES');
    expect(constructCandidates(payload, 'Е99-99-999-999').status).toBe('UNKNOWN_WORK');
  });
  it('paginates without duplicating rules; range and wildcard scope evidence is retained', () => {
    const key = fixture.cases[0].work_key;
    const full = constructCandidates(payload, key, 100);
    const first = constructCandidates(payload, key, 2), next = constructCandidates(payload, key, 2, 2);
    expect([...first.candidates, ...next.candidates]).toEqual(full.candidates.slice(0, 4));
    expect(full.candidates.every(c => c.scopes.length > 0)).toBe(true);
    expect(constructCandidates(payload, key, 2, 999).candidates).toEqual([]);
  });
  it.each([0, 101, NaN, 1.5])('rejects unbounded limit %s', limit => expect(() => constructCandidates(payload, fixture.cases[0].work_key, limit)).toThrow());
  it.each(['E1-1-1', 'Е01-01-001-1junk', '../Е01-01-001-1', 'Е01-01-001-1\n'])('does not use fuzzy work identity for %j', key => expect(constructWorkKey(key)).toBeNull());
  it('normalizes formatting only, preserving the source family', () => {
    expect(constructWorkKey('E1-1-1-1')).toBe('Е01-01-001-1');
    expect(constructWorkKey('Ц1-1-1-1')).toBe('Ц01-01-001-1');
    expect(constructWorkKey('У1-1-1-1')).toBe('У01-01-001-1');
    expect(constructWorkKey('Е51-1-1')).toBe('Е51-1-1');
    expect(constructWorkKey('Е51-1-1junk')).toBeNull();
    const p = { ...payload, works: [...payload.works, 'Е51-1-1', 'У01-01-001-1'] };
    expect(constructCandidates(p, 'Е51-1-1').status).toBe('NO_SOURCE_CANDIDATES');
    expect(constructCandidates(p, 'У01-01-001-1').status).toBe('NO_SOURCE_CANDIDATES');
  });
  it('never enables source rules for no condition / zero / additive / unapproved source', () => {
    const p = structuredClone(payload);p.rules[0].title = '';p.rules[0].materials = 0;p.rules[0].calculation_approved = 1;
    expect(constructCandidates(p, fixture.cases[0].work_key).canApply).toBe(false);
    // No executable WorkCoefficient is returned; source factors remain evidence only.
    expect(constructCandidates(p, fixture.cases[0].work_key)).not.toHaveProperty('coefficients');
  });
  it('requests only one selected work with bounded paging and rejects execution-enabling responses', async () => {
    const key = fixture.cases[0].work_key;
    let requested = '';
    const fetcher = async (url: RequestInfo | URL) => { requested = String(url);return Response.json(constructCandidates(payload, key)); };
    expect((await loadConstructCandidates(key, 0, fetcher)).canApply).toBe(false);
    expect(requested).toContain('limit=20&offset=0');
    await expect(loadConstructCandidates(key, 0, async () => Response.json({ ...constructCandidates(payload, key), canApply: true }))).rejects.toThrow('REFERENCE_RESPONSE_INVALID');
    await expect(loadConstructCandidates(key, 0, async () => new Response('', { status: 503 }))).rejects.toThrow('REFERENCE_UNAVAILABLE');
  });
});
