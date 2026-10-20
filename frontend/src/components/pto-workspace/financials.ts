import type { ObjectFinancials } from '../../api/t2-object-financials';
import type { Aggregate } from './hierarchy';
export const FINANCIAL_METRICS = ['smeta', 'fakt', 'f2', 'ostatka'] as const;
export type FinancialMetric = typeof FINANCIAL_METRICS[number];
export type FinancialTotals = Record<FinancialMetric, Aggregate> & { legacy: number };
/** A shared object contributes once. Unknown counts are unresolved monetary entries. */
export function aggregateFinancials(ids: readonly number[], rows: readonly ObjectFinancials[]): FinancialTotals {
  return makeFinancialSummarizer(rows)(ids);
}

/** Index once per response, rather than once per table cell. */
export function makeFinancialSummarizer(rows: readonly ObjectFinancials[]) {
  const byId = new Map(rows.map(row => [row.obyekt_id, row]));
  return (ids: readonly number[]): FinancialTotals => {
    const unique = [...new Set(ids)];
    const totals = Object.fromEntries(FINANCIAL_METRICS.map(key => {
      let known = 0, unknown = 0, present = 0;
      for (const id of unique) {
        const amount = byId.get(id)?.[key];
        if (amount?.known == null || !Number.isFinite(amount.known)) unknown += Math.max(1, amount?.unknown ?? 0);
        else { known += amount.known; present++; unknown += amount.unknown; }
      }
      return [key, { known, unknown, present, total: unique.length }];
    })) as Record<FinancialMetric, Aggregate>;
    return { ...totals, legacy: unique.reduce((sum, id) => sum + (byId.get(id)?.f2_legacy_count ?? 0), 0) };
  };
}
