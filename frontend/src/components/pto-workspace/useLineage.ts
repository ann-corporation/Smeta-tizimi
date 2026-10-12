import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { shartnomaLiniyaOl } from '../../api/t2-shartnoma-liniya';
import { onEntityChanged } from '../../api/entity-consistency';

/** One cached canonical chain request per company, never one request per object. */
export function useCompanyLineage(companyId: number | null) {
  const cache = useQueryClient();
  useEffect(() => onEntityChanged(event => {
    if (event.detail.kompaniyaId === companyId) void cache.invalidateQueries({queryKey:['pto-company-lineage',companyId]});
  }), [companyId,cache]);
  return useQuery({ queryKey: ['pto-company-lineage', companyId], enabled: !!companyId,
    staleTime: 60_000, retry: false,
    queryFn: async () => {
      const result = await shartnomaLiniyaOl(companyId!);
      if (!result.ok) throw new Error(result.error);
      const line = result.natija;
      if (!Array.isArray(line.loyihalar) || !Array.isArray(line.obyektlar) || !Array.isArray(line.shartnomalar)
        || line.shartnomalar.some(s => !Array.isArray(s.obyektlar) || !Array.isArray(s.tomonlar))) throw new Error('PROJECT_CHAIN_INCOMPLETE');
      return result.natija;
    },
  });
}
