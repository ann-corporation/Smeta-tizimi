import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import type { T2Obyekt } from '../../api/supabase';
import { objectFinancialsOl, type ObjectFinancials } from '../../api/t2-object-financials';
import { onEntityChanged } from '../../api/entity-consistency';
import { makeFinancialSummarizer } from './financials';

const EMPTY: readonly ObjectFinancials[] = [];
/** Atomic across batches: no partial success becomes a complete scope total. */
export function useObjectFinancials(companyId: number, objects: readonly T2Obyekt[]) {
  const cache = useQueryClient();
  useEffect(() => onEntityChanged(event => {
    if (event.detail.kompaniyaId === companyId) void cache.invalidateQueries({ queryKey: ['pto-object-financials', companyId] });
  }), [cache, companyId]);
  const ordered = [...new Map(objects.filter(o => o.kompaniya_id === companyId).map(o => [o.id, o])).values()].sort((a, b) => a.id - b.id);
  const ids = ordered.map(o => o.id);
  const query = useQuery({
    queryKey: ['pto-object-financials', companyId, ordered.map(o => [o.id, o.versiya, o.yangilandi])],
    enabled: Number.isInteger(companyId) && companyId > 0 && ids.length > 0,
    staleTime: 60_000, retry: false,
    placeholderData: undefined,
    queryFn: async ({ signal }) => {
      const rows = [];
      for (let i = 0; i < ids.length; i += 200) {
        const packet = await objectFinancialsOl(companyId, ids.slice(i, i + 200), signal);
        rows.push(...packet.objects);
      }
      return rows;
    },
  });
  // Even a failed background refresh cannot present an old total as current.
  const rows = query.isError ? EMPTY : query.data ?? EMPTY;
  const sum = useMemo(() => makeFinancialSummarizer(rows), [rows]);
  return {
    loading: ids.length > 0 && query.isPending,
    failed: query.isError,
    retry: () => { void query.refetch(); },
    sum,
  };
}
