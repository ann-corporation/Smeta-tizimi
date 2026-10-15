/** Source evidence reconciliation, NOT a normative calculation/approval engine. */
export function familyKey(code) {
  const m = /^[ШП]-0*(\d+)([-А-ЯA-Z0-9]*)$/u.exec(String(code ?? '').trim().toUpperCase());
  return m ? `${m[1]}${m[2]}` : null;
}
export function tableKey(code) {
  const m = /^[EЕ]?(\d+)-(\d+)-(\d+)(?:-(\d+))?$/u.exec(String(code ?? '').trim().toUpperCase());
  return m ? m.slice(1).filter(v => v !== undefined).map(v => String(Number(v))).join('-') : null;
}
const isAdditive = text => /добав|прибав|на\s+кажд\S*\s+(?:последующ|метр)/iu.test(text);
const dict = v => v && typeof v === 'object' && !Array.isArray(v);

export class CoefficientAudit {
  constructor(runtime, { sampleLimit = 100, onIssue = () => {} } = {}) {
    if (runtime?.schema !== 'koef-katalog-v1' || !dict(runtime.koef) || !dict(runtime.jadval)) throw new Error('RUNTIME_SCHEMA_INVALID');
    if (!Number.isInteger(sampleLimit) || sampleLimit < 0 || sampleLimit > 1000) throw new Error('SAMPLE_LIMIT_INVALID');
    this.runtime = runtime; this.sampleLimit = sampleLimit; this.onIssue = onIssue;
    this.rules = new Map(); this.families = new Map(); this.linkIds = new Set();
    this.tablesByFamily = new Map(); this.counts = {}; this.examples = new Map(); this.blocking = 0;
    this.ruleCount = 0; this.linkCount = 0; this.resolvedLinks = 0; this.eCrosswalkLinks = 0;
  }
  issue(code, context = {}, blocking = false) {
    this.counts[code] = (this.counts[code] ?? 0) + 1;
    if (blocking) this.blocking++;
    const issue = { finding: code, blocking, ...context };
    this.onIssue(issue);
    const examples = this.examples.get(code) ?? [];
    if (examples.length < Math.min(10, this.sampleLimit)) examples.push(issue);
    this.examples.set(code, examples);
  }
  addRule(rule) {
    this.ruleCount++;
    if (!dict(rule?.source) || rule.factReferenceId == null) { this.issue('SOURCE_RULE_INVALID', {}, true); return; }
    if (this.rules.has(rule.factReferenceId)) { this.issue('DUPLICATE_SOURCE_RULE_ID', { id: rule.factReferenceId }, true); return; }
    this.rules.set(rule.factReferenceId, rule);
    const key = familyKey(rule.source.KODP);
    if (!key) { this.issue('SOURCE_RULE_OUTSIDE_E_CROSSWALK', { id: rule.factReferenceId }); return; }
    const list = this.families.get(key) ?? []; list.push(rule); this.families.set(key, list);
  }
  addLink(link) {
    this.linkCount++;
    if (link?.factReferenceId == null || !dict(link.source)) { this.issue('SOURCE_LINK_INVALID', {}, true); return; }
    if (this.linkIds.has(link.factReferenceId)) { this.issue('DUPLICATE_SOURCE_LINK_ID', { id: link.factReferenceId }, true); return; }
    this.linkIds.add(link.factReferenceId);
    const key = familyKey(link.source.KODP), table = tableKey(link.source.KODTAB);
    const refs = link.coefficientFactReferenceIds;
    if (!Array.isArray(refs) || refs.length === 0 || refs.some(id => !this.rules.has(id))) {
      this.issue('SOURCE_LINK_RULE_UNRESOLVED', { id: link.factReferenceId, sourceRule: link.source.KODP }); return;
    }
    if (!link.source.KODTAB || !link.source.KODE) { this.issue('SOURCE_LINK_SCOPE_FIELDS_MISSING', { id: link.factReferenceId }); return; }
    if (!refs.some(id => this.rules.get(id)?.source.KODP === link.source.KODP)) {
      this.issue('SOURCE_LINK_RULE_CONTRADICTION', { id: link.factReferenceId }, true); return;
    }
    this.resolvedLinks++;
    if (!key || !table || !/^[EЕ]/u.test(link.source.KODTAB)) { this.issue('SOURCE_LINK_OUTSIDE_E_CROSSWALK', { id: link.factReferenceId }); return; }
    this.eCrosswalkLinks++;
    const tables = this.tablesByFamily.get(key) ?? new Set(); tables.add(table); this.tablesByFamily.set(key, tables);
  }
  finish() {
    const runtimeFamilies = new Set();
    for (const [code, rule] of Object.entries(this.runtime.koef)) {
      const key = familyKey(code); if (key) runtimeFamilies.add(key);
      if (!dict(rule) || !dict(rule.k)) { this.issue('RUNTIME_RULE_INVALID', { code }, true); continue; }
      const values = Object.entries(rule.k);
      if (!values.length || values.some(([scope, value]) => !['ЧЕЛ', 'МАШ', 'МАТ'].includes(scope) || typeof value !== 'number' || !Number.isFinite(value) || value < 0)) this.issue('RUNTIME_VALUES_INVALID', { code }, true);
      const text = `${rule.t ?? ''} ${rule.s ?? ''} ${rule.q ?? ''}`;
      if (isAdditive(text)) this.issue('ADDITIVE_OPERATION_REQUIRES_MAPPING', { code, values: rule.k }, true);
      if (values.some(([, value]) => value === 0)) this.issue('ZERO_SEMANTICS_REQUIRES_MAPPING', { code, values: rule.k }, true);
      if (!rule.a || !rule.s) this.issue('RUNTIME_CONDITION_OR_REFERENCE_MISSING', { code }, true);
      const candidates = this.families.get(key) ?? [];
      if (candidates.length > 1) this.issue('SOURCE_CODE_CROSSWALK_AMBIGUOUS', { code, sourceIds: candidates.map(v => v.factReferenceId) });
      if (!candidates.length) this.issue('NO_LEGACY_CODE_CANDIDATE', { code });
    }
    for (const [family, rules] of this.families) if (!runtimeFamilies.has(family)) this.issue('LEGACY_RULE_NOT_IN_RUNTIME', { family, sourceCodes: rules.map(r => r.source.KODP) });
    for (const [table, codes] of Object.entries(this.runtime.jadval)) {
      if (!tableKey(table) || !Array.isArray(codes)) { this.issue('RUNTIME_TABLE_INVALID', { table }, true); continue; }
      const seen = new Set();
      for (const code of codes) {
        if (seen.has(code)) this.issue('DUPLICATE_RUNTIME_ASSOCIATION', { table, code }, true); seen.add(code);
        if (!Object.hasOwn(this.runtime.koef, code)) { this.issue('RUNTIME_DANGLING_RULE', { table, code }, true); continue; }
        const sourceTables = this.tablesByFamily.get(familyKey(code));
        // Differences between editions/sources require review, not automatic repair.
        if (sourceTables && !sourceTables.has(tableKey(table))) this.issue('RUNTIME_TABLE_WITHOUT_LEGACY_EVIDENCE', { table, code });
      }
    }
    if (!this.ruleCount || !this.linkCount) this.issue('SOURCE_CORPUS_EMPTY', {}, true);
    const samples = [...this.examples.values()].sort((a, b) => Number(b[0]?.blocking) - Number(a[0]?.blocking)).flat().slice(0, this.sampleLimit);
    return {
      schema: 'coefficient-integration-audit-v1',
      counts: { sourceRules: this.ruleCount, sourceLinks: this.linkCount, sourceLinksWithRuleAndScopeFields: this.resolvedLinks, eCrosswalkLinks: this.eCrosswalkLinks, runtimeRules: Object.keys(this.runtime.koef).length, runtimeTableKeys: Object.keys(this.runtime.jadval).length },
      publicationGate: this.blocking ? 'BLOCKED' : 'NO_STRUCTURAL_BLOCKERS', blockingFindings: this.blocking,
      findings: this.counts, samples, sampleLimit: this.sampleLimit,
      omittedSamples: Math.max(0, Object.values(this.counts).reduce((a, b) => a + b, 0) - samples.length),
      crosswalkStatus: 'CODE_KEY_CANDIDATES_ONLY_NOT_EDITION_EQUIVALENCE',
      crosswalkScope: 'E_WORKS_ONLY_OTHER_BOOK_FAMILIES_RETAINED_IN_SOURCE_COUNTS',
      officialNormsApproved: false, canAutoApply: false, deployedRuntimeVerified: false,
    };
  }
}
