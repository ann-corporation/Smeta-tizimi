/** Independent acceptance oracle for Construct scope. Not imported by production code.
 * Source: installed NormRepository.Corrections SQL + typed source snapshot.
 * Scope match only yields reference candidates, never business approval.
 */
export type ScopeRule = { rule_id: number; kind: string; collection_code: string };
export type ScopeTarget = { scope_id: number; rule_id: number; otdel: string; tbl: string; n_from: number; n_to: number };

export function parseWorkKey(key: string) {
  const m = /^([ЕРЦП])(\d{2})-(\d{2})-(\d{3})-(\d+)$/.exec(key);
  return m && m[0] === key ? { family: m[1], collection: m[2], section: m[3], table: m[4], norm: Number(m[5]) } : null;
}

export function scopeCandidates(key: string, rules: ScopeRule[], scopes: ScopeTarget[]): number[] {
  const work = parseWorkKey(key);
  if (!work) return [];
  const applicable = new Set(rules.filter(r => r.kind === work.family && r.collection_code === work.collection).map(r => r.rule_id));
  const out = new Set<number>();
  for (const s of scopes) {
    if (applicable.has(s.rule_id) && (s.otdel === '*' || (s.otdel === work.section && s.tbl === work.table
      && (s.n_from === 0 || (work.norm >= s.n_from && work.norm <= s.n_to))))) out.add(s.rule_id);
  }
  return [...out].sort((a, b) => a - b);
}

/** Known source identity and lack of associations have different meanings. */
export function sourceLookup(key: string, knownWorks: string[], rules: ScopeRule[], scopes: ScopeTarget[]) {
  if (!knownWorks.includes(key)) return { status: 'UNKNOWN_WORK', ruleIds: [] };
  const ruleIds = scopeCandidates(key, rules, scopes);
  return { status: ruleIds.length ? 'REFERENCE_CANDIDATES' : 'NO_SOURCE_CANDIDATES', ruleIds };
}

/** Approval oracle only: a source number is not an executable operation. */
export function coefficientGate(rule: { operation: 'MUL' | 'ADDITIVE' | 'UNKNOWN'; condition: string | null;
  conditionConfirmed: boolean; sourceApproved: boolean; factors: Array<number | null> }) {
  const reasons: string[] = [];
  if (!rule.sourceApproved) reasons.push('SOURCE_NOT_APPROVED');
  if (!rule.condition?.trim() || !rule.conditionConfirmed) reasons.push('CONDITION_UNCONFIRMED');
  if (rule.operation !== 'MUL') reasons.push('OPERATION_REQUIRES_MAPPING');
  if (rule.factors.some(f => f == null || !Number.isFinite(f) || f <= 0)) reasons.push('FACTOR_SEMANTICS_UNRESOLVED');
  return { canApply: reasons.length === 0, reasons };
}
