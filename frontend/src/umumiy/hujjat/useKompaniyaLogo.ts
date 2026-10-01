import { useQuery } from '@tanstack/react-query';
import { sbKompaniyaLogoOl } from '../../api/t2-ijro';

export const kalit = (id: number) => ['kompaniya-logo', id] as const;

export function useKompaniyaLogo(kompaniyaId: number | null | undefined) {
  return useQuery({
    queryKey: kalit(kompaniyaId ?? 0),
    queryFn: () => sbKompaniyaLogoOl(kompaniyaId!),
    enabled: !!kompaniyaId,
    staleTime: 10 * 60 * 1000,
  });
}
