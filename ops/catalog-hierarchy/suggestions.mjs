/** Evidence candidates only. Similarity is ranking, never normative approval. */
export function coefficientCandidates(work, links, scopes, rules) {
  const scope = new Map(scopes.map(s => [s.archiveOccurrenceId, s]));
  const rule = new Map(rules.map(r => [r.factReferenceId, r]));
  const out = [];
  for (const link of links) {
    if (link.source.KODE !== work.code || link.source.KODTAB !== work.tableCode) continue;
    const evidenceScopes = (link.workArchiveOccurrenceIds ?? []).map(id => scope.get(id)).filter(s => s &&
      s.codeRaw === work.code && s.tableRaw === work.tableCode && s.bookTypeRaw === work.bookType && s.collectionRaw === work.collection);
    if (!evidenceScopes.length) continue;
    for (const id of link.coefficientFactReferenceIds ?? []) {
      const r = rule.get(id); if (!r) continue;
      out.push({ linkId: link.factReferenceId, ruleId: id, name: r.source.NAME, rawExpression: r.source.PRAV,
        referenceCode: r.source.KODP, archiveOccurrenceIds: evidenceScopes.map(s => s.archiveOccurrenceId).sort((a,b)=>a-b),
        status: 'SOURCE_RULE_REVIEW_REQUIRED', canApply: false,
        blockers: ['OFFICIAL_EDITION_UNVERIFIED','CONDITION_AND_BASE_UNVERIFIED','SOURCE_DSL_UNVERIFIED'] });
    }
  }
  return out.sort((a,b)=>a.linkId-b.linkId || a.ruleId-b.ruleId);
}

const tokens = name => new Set((name ?? '').toLocaleLowerCase('ru').match(/[\p{L}\p{N}]+/gu) ?? []);
const numbers = name => [...tokens(name)].filter(t => /^\d/.test(t)).sort().join('|');
/** A bounded shortlist from one existing source shard. No cross-category/unit mixing. */
export function alternativeCandidates(source, candidates, { query = source.name, limit = 20 } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('LIMIT_INVALID');
  if (!source.type || !source.unitCode) return [];
  const wanted = tokens(query); if (!wanted.size) return [];
  const best = [];
  for (const c of candidates) {
    if (!c.id || c.id === source.id || c.type !== source.type || c.unitCode !== source.unitCode || !c.name) continue;
    const actual = tokens(c.name); let overlap = 0;
    for (const t of wanted) if (actual.has(t)) overlap++;
    if (!overlap) continue;
    const similarity = Math.round(100 * overlap / (wanted.size + actual.size - overlap));
    const row = { ...c, similarity, scoreMeaning: 'LEXICAL_OVERLAP_NOT_PROBABILITY', canApply: false,
      status: 'OPERATOR_REVIEW_REQUIRED', warnings: numbers(c.name) !== numbers(source.name)
        ? ['CAPACITY_OR_DIMENSION_DIFFERENCE','NORM_AND_COEFFICIENT_REVIEW_REQUIRED'] : ['SPECIFICATION_REVIEW_REQUIRED'] };
    const pos = best.findIndex(b => b.similarity < similarity || (b.similarity === similarity && b.id > c.id));
    if (pos < 0) { if (best.length < limit) best.push(row); }
    else best.splice(pos, 0, row);
    if (best.length > limit) best.pop();
  }
  return best;
}

export function workAlternativeCandidates(source, candidates, options = {}) {
  if (!source.bookType || !source.collection || !source.unitCode || !source.confirmedBasisScale || !source.catalogRevision) return [];
  const compatible = candidates.filter(c => c.bookType === source.bookType && c.collection === source.collection &&
    c.catalogRevision === source.catalogRevision && c.confirmedBasisScale === source.confirmedBasisScale);
  return alternativeCandidates({ ...source, type: 'WORK' }, compatible.map(c => ({ ...c, type: 'WORK' })), options)
    .map(c => ({ ...c, warnings: [...c.warnings, 'WORK_RECIPE_AND_METHOD_REVIEW_REQUIRED'], canApply: false }));
}
