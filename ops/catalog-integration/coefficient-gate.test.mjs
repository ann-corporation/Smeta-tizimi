import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CoefficientAudit, familyKey, tableKey } from './coefficient-gate.mjs';
const good = () => ({ schema: 'koef-katalog-v1', koef: { 'П-6001': { a: 'ТЧп.3.1', s: 'От16до35м', k: { ЧЕЛ: 1.04 } } }, jadval: { '6-1-1': ['П-6001'] } });
const rule = (id = 1, code = 'Ш-6001') => ({ factReferenceId: id, source: { KODP: code } });
const link = (id = 1, table = 'E6-1-1') => ({ factReferenceId: id, source: { KODP: 'Ш-6001', KODTAB: table, KODE: `${table}-2` }, coefficientFactReferenceIds: [1] });
function filled(runtime = good(), options) { const a = new CoefficientAudit(runtime, options); a.addRule(rule()); a.addLink(link()); return a; }
test('crosswalk keys retain suffixes; table-row boundaries are anchored', () => {
  assert.equal(familyKey('Ш-006001'), familyKey('П-6001'));
  assert.notEqual(familyKey('П-6001-А'), familyKey('П-6001-Б'));
  assert.equal(familyKey('6001'), null); assert.equal(tableKey('E6-1-1-2x'), null);
  assert.equal(tableKey('Е06-01-001-02'), '6-1-1-2');
});
test('ordinary1.04 labor multiplier has no structural blockers, never normative approval', () => {
  const r = filled().finish(); assert.equal(r.publicationGate, 'NO_STRUCTURAL_BLOCKERS');
  assert.equal(r.canAutoApply, false); assert.equal(r.officialNormsApproved, false);
});
test('additive0.005 is blocked instead of silently becoming multiplier1.005 or0.005', () => {
  const k = good(); k.koef['П-6001'].s = 'На каждый метр добавить0,005'; k.koef['П-6001'].k = { ЧЕЛ: 0.005 };
  const r = filled(k).finish(); assert.equal(r.findings.ADDITIVE_OPERATION_REQUIRES_MAPPING, 1); assert.equal(r.publicationGate, 'BLOCKED');
  assert.equal(k.koef['П-6001'].k.ЧЕЛ, 0.005);
});
test('zero requires source semantics; no blanket0→1 or material deletion', () => {
  const k = good(); k.koef['П-6001'].k.МАТ = 0;
  assert.equal(filled(k).finish().findings.ZERO_SEMANTICS_REQUIRES_MAPPING, 1);
});
test('source rule and link duplicate identifiers fail closed', () => {
  const a = filled(); a.addRule(rule()); a.addLink(link()); const r = a.finish();
  assert.equal(r.findings.DUPLICATE_SOURCE_RULE_ID, 1); assert.equal(r.findings.DUPLICATE_SOURCE_LINK_ID, 1); assert.equal(r.publicationGate, 'BLOCKED');
});
test('unresolved references remain explicit; cannot establish scope', () => {
  const a = new CoefficientAudit(good()); a.addRule(rule()); a.addLink({ ...link(), coefficientFactReferenceIds: [99] });
  const r = a.finish(); assert.equal(r.counts.sourceLinksWithRuleAndScopeFields, 0); assert.equal(r.findings.SOURCE_LINK_RULE_UNRESOLVED, 1);
});
test('contradicting rule pointer cannot establish association', () => {
  const a = new CoefficientAudit(good()); a.addRule(rule(1, 'Ш-6002')); a.addLink(link());
  assert.equal(a.finish().findings.SOURCE_LINK_RULE_CONTRADICTION, 1);
});
test('same-code source editions are ambiguous, not merged as equal', () => {
  const a = filled(); a.addRule(rule(2)); const r = a.finish();
  assert.equal(r.findings.SOURCE_CODE_CROSSWALK_AMBIGUOUS, 1); assert.equal(r.counts.sourceRules, 2);
});
test('missing legacy6029 and expanded table6-1-3 are review findings', () => {
  const k = good(); k.jadval['6-1-3'] = ['П-6001']; const a = filled(k); a.addRule(rule(2, 'Ш-6029'));
  const r = a.finish(); assert.equal(r.findings.LEGACY_RULE_NOT_IN_RUNTIME, 1); assert.equal(r.findings.RUNTIME_TABLE_WITHOUT_LEGACY_EVIDENCE, 1);
});
test('dangling and duplicate runtime associations block release', () => {
  const k = good(); k.jadval['6-1-1'] = ['П-6001', 'П-6001', 'П-99999']; const r = filled(k).finish();
  assert.equal(r.findings.RUNTIME_DANGLING_RULE, 1); assert.equal(r.findings.DUPLICATE_RUNTIME_ASSOCIATION, 1);
});
test('bad schema and empty source cannot give a green release', () => {
  assert.throws(() => new CoefficientAudit({}), /RUNTIME_SCHEMA/);
  assert.equal(new CoefficientAudit(good()).finish().publicationGate, 'BLOCKED');
});
test('non-E source families counted but never collapsed into E runtime keys', () => {
  const a = filled(); a.addRule(rule(2, 'Ц-6001'));
  a.addLink({ ...link(2, 'Ц6-1-1'), source: { KODP: 'Ц-6001', KODTAB: 'Ц6-1-1', KODE: 'Ц6-1-1-2' }, coefficientFactReferenceIds: [2] });
  const r = a.finish(); assert.equal(r.counts.sourceLinksWithRuleAndScopeFields, 2); assert.equal(r.counts.eCrosswalkLinks, 1);
  assert.equal(r.findings.SOURCE_LINK_OUTSIDE_E_CROSSWALK, 1);
});
test('invalid finite values and missing conditions are publication blockers', () => {
  const k = good(); k.koef['П-6001'].k.ЧЕЛ = NaN; k.koef['П-6001'].s = '';
  const r = filled(k).finish(); assert.equal(r.findings.RUNTIME_VALUES_INVALID, 1); assert.equal(r.findings.RUNTIME_CONDITION_OR_REFERENCE_MISSING, 1);
});
test('bounded samples do not suppress blocker counts on10k links', () => {
  const k = good(); k.koef['П-6001'].k.МАТ = 0; const a = new CoefficientAudit(k, { sampleLimit: 0 }); a.addRule(rule());
  for (let i = 0; i < 10000; i++) a.addLink(link(i));
  const r = a.finish(); assert.equal(r.counts.sourceLinks, 10000); assert.equal(r.samples.length, 0);
  assert.equal(r.blockingFindings, 1); assert.equal(r.omittedSamples, 1); assert.equal(r.publicationGate, 'BLOCKED');
});
test('all findings reach the ledger even when UI samples are bounded', () => {
  const issues = []; const k = good(); k.koef['П-6001'].k.МАТ = 0;
  const a = new CoefficientAudit(k, { sampleLimit: 1, onIssue: v => issues.push(v) }); a.addRule(rule()); a.addLink(link());
  for (let i = 2; i < 32; i++) a.addRule(rule(i, 'Ц-6001'));
  const r = a.finish(); assert.equal(issues.length, 31); assert.equal(r.samples.length, 1);
  assert.equal(r.samples[0].finding, 'ZERO_SEMANTICS_REQUIRES_MAPPING');
});
