/** Source-specific reference candidates. Never converted into executable WorkCoefficient. */
export const CONSTRUCT_REFERENCE = {
  edition: 'Construct 2.7.3 / audit-20261021',
  sha256: '11f9a6ce4cc156fb51a1419562cca846a654ced4fb77bf605b012952c8a2a7b1',
  sourceSha256: '9837657b6c0bb41980da2b9fc8f86bb88042f522bd88d5617f520a97e42578f6',
} as const;
export type ConstructRule = { rule_id: number; kind: string; collection_code: string; code: string; title: string; basis: string;
  labour: number; machines: number; materials: number; calculation_approved: number; source_sha256: string };
export type ConstructScope = { scope_id: number; rule_id: number; otdel: string; tbl: string; n_from: number; n_to: number };
export type ConstructPayload = { schema: string; source_sha256: string; calculation_approved: boolean; works: string[]; rules: ConstructRule[]; scopes: ConstructScope[] };
export type ConstructCandidate = { rule: ConstructRule; scopes: ConstructScope[] };
export type ConstructResult = { ok: true; status: 'UNKNOWN_WORK' | 'NO_SOURCE_CANDIDATES' | 'REFERENCE_CANDIDATES';
  workKey: string; edition: string; sourceSha256: string; referenceSha256: string; canApply: false;
  total: number; offset: number; limit: number; candidates: ConstructCandidate[] };

/** Formatting alias only; it does not establish equivalence across normative editions. */
export function constructWorkKey(code: string): string | null {
  // Repair books 51..69 use the observed three-part keys (Е51-1-1).
  const repair = /^[EЕ](5[1-9]|6\d)-(\d{1,3})-(\d{1,3})$/.exec(code);
  if (repair && repair[0] === code) return `Е${repair[1]}-${Number(repair[2])}-${Number(repair[3])}`;
  const m = /^([EЕРЦПУ])(\d{1,2})-(\d{1,2})-(\d{1,3})-(\d{1,3})$/.exec(code);
  if (!m || m[0] !== code) return null;
  return `${m[1] === 'E' ? 'Е' : m[1]}${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}-${m[4].padStart(3, '0')}-${Number(m[5])}`;
}

export function constructCandidates(payload: ConstructPayload, workKey: string, limit = 20, offset = 0): ConstructResult {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0) throw new Error('REFERENCE_PAGE_INVALID');
  const key = constructWorkKey(workKey);
  if (!key) throw new Error('REFERENCE_WORK_KEY_INVALID');
  const result: ConstructResult = { ok: true, status: 'UNKNOWN_WORK', workKey: key, edition: CONSTRUCT_REFERENCE.edition,
    sourceSha256: payload.source_sha256, referenceSha256: CONSTRUCT_REFERENCE.sha256, canApply: false, total: 0, limit, offset, candidates: [] };
  if (!payload.works.includes(key)) return result;
  const m = /^(.)(\d{2})-(\d{2})-(\d{3})-(\d+)$/.exec(key);
  if (!m) return { ...result, status: 'NO_SOURCE_CANDIDATES' };
  const rules = payload.rules.filter(r => r.kind === m[1] && r.collection_code === m[2]);
  const byRule = new Map<number, ConstructScope[]>();
  for (const scope of payload.scopes) {
    const list = byRule.get(scope.rule_id) ?? [];list.push(scope);byRule.set(scope.rule_id, list);
  }
  const candidates = rules.flatMap(rule => {
    const scopes = (byRule.get(rule.rule_id) ?? []).filter(s => (s.otdel === '*'
      || (s.otdel === m[3] && s.tbl === m[4] && (s.n_from === 0 || (Number(m[5]) >= s.n_from && Number(m[5]) <= s.n_to)))));
    return scopes.length ? [{ rule, scopes }] : [];
  }).sort((a, b) => a.rule.rule_id - b.rule.rule_id);
  return { ...result, status: candidates.length ? 'REFERENCE_CANDIDATES' : 'NO_SOURCE_CANDIDATES',
    total: candidates.length, candidates: candidates.slice(offset, offset + limit) };
}

export async function loadConstructCandidates(code: string, offset = 0, fetcher: typeof fetch = fetch, signal?: AbortSignal): Promise<ConstructResult> {
  const key = constructWorkKey(code);
  if (!key) throw new Error('REFERENCE_WORK_KEY_INVALID');
  // Relative URL uses the browser's default same-origin credentials policy.
  const response = await fetcher(`/api/koef-katalog?f=construct&work=${encodeURIComponent(key)}&limit=20&offset=${offset}`, { signal });
  if (!response.ok) throw new Error('REFERENCE_UNAVAILABLE');
  const result = await response.json() as ConstructResult;
  if (result.ok !== true || result.canApply !== false || result.referenceSha256 !== CONSTRUCT_REFERENCE.sha256
    || result.sourceSha256 !== CONSTRUCT_REFERENCE.sourceSha256 || result.edition !== CONSTRUCT_REFERENCE.edition
    || result.workKey !== key || result.offset !== offset || result.limit !== 20 || !Number.isSafeInteger(result.total) || result.total < 0
    || !Array.isArray(result.candidates) || result.candidates.length > 20
    || !['UNKNOWN_WORK', 'NO_SOURCE_CANDIDATES', 'REFERENCE_CANDIDATES'].includes(result.status)) throw new Error('REFERENCE_RESPONSE_INVALID');
  return result;
}
