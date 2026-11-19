/**
 * Kompaniya sozlamalari: React hooklari. Sof yuklovchi (fetch/parse, react'siz) - kompaniya-sozlama-yuklovchi.ts (MCP ham shuni ishlatadi).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SozlamaXatosi, kompaniyaSozlamaKalit, kompaniyaSozlamaOl, kompaniyaSozlamaYoz } from './kompaniya-sozlama-yuklovchi';

export * from './kompaniya-sozlama-yuklovchi';

export function useKompaniyaSozlama(kompaniyaId: number | null | undefined) {
  return useQuery({
    queryKey: kompaniyaSozlamaKalit(kompaniyaId),
    queryFn: () => kompaniyaSozlamaOl(kompaniyaId as number),
    enabled: kompaniyaId != null,
    staleTime: 30_000,
    retry: (n, e) => !(e instanceof SozlamaXatosi && [401, 403, 404].includes(e.status)) && n < 1,
  });
}

export function useKompaniyaSozlamaSaqla() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: kompaniyaSozlamaYoz,
    onSuccess: (_d, v) => { void qc.invalidateQueries({ queryKey: kompaniyaSozlamaKalit(v.kompaniya_id) }); },
  });
}
