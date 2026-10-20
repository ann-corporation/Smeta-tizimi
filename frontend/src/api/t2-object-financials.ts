export type FinancialAmount = { known: number | null; unknown: number };
export type ObjectFinancials = {
  obyekt_id: number;
  smeta: FinancialAmount; fakt: FinancialAmount; f2: FinancialAmount; ostatka: FinancialAmount;
  f2_legacy_count?: number;
};
export type ObjectFinancialsResponse = { ok: true; kompaniya_id: number; objects: ObjectFinancials[] };

/** Session-authenticated server read model; no client reconstruction from all acts. */
export async function objectFinancialsOl(companyId: number, ids: readonly number[], signal?: AbortSignal): Promise<ObjectFinancialsResponse> {
  signal?.throwIfAborted();
  const unique = [...new Set(ids)].sort((a, b) => a - b);
  if (!Number.isInteger(companyId) || companyId <= 0 || !unique.length || unique.length > 200 || unique.some(id => !Number.isInteger(id) || id <= 0)) throw new Error('OBJECT_FINANCIALS_SCOPE');
  const params = new URLSearchParams({ kompaniya_id: String(companyId), obyektlar: unique.join(',') });
  const response = await fetch('/api/object-financials?' + params, { signal });
  const data = await response.json();
  signal?.throwIfAborted();
  if (!response.ok || data?.ok !== true || data.kompaniya_id !== companyId || !Array.isArray(data.objects)) throw new Error('OBJECT_FINANCIALS_READ_FAILED');
  const seen = new Set<number>();
  for (const row of data.objects) {
    if (!row || !unique.includes(row.obyekt_id) || seen.has(row.obyekt_id)) throw new Error('OBJECT_FINANCIALS_SCOPE');
    seen.add(row.obyekt_id);
    for (const key of ['smeta', 'fakt', 'f2', 'ostatka'] as const) {
      const amount = row[key];
      if (!amount || (amount.known !== null && (typeof amount.known !== 'number' || !Number.isFinite(amount.known))) || !Number.isInteger(amount.unknown) || amount.unknown < 0) throw new Error('OBJECT_FINANCIALS_INVALID');
    }
    if (row.f2_legacy_count !== undefined && (!Number.isInteger(row.f2_legacy_count) || row.f2_legacy_count < 0)) throw new Error('OBJECT_FINANCIALS_INVALID');
  }
  if (seen.size !== unique.length) throw new Error('OBJECT_FINANCIALS_INCOMPLETE');
  return data;
}
