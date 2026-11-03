import { useCallback, useContext, useMemo } from 'react';
import { QueryClient, QueryClientContext, useQuery } from '@tanstack/react-query';
import { aktPodvallariniOl } from '../../api/t2-akt-podval';
import { aktPodvalXaritasi, type AktPodvalQator } from '../../lib/akt-podval';
import type { AktPodvalNk } from '../../lib/hisob-yadro';

const BOSH_KLIENT = new QueryClient();

/**
 * Obyektning F2 hujjat podvallari (`t2_akt_podval`, egasi 2026-11-03): F2 hujjati O'Z podvali bilan baholanadi.
 * `nkOl(aktId, blok)` — (akt, blok) ning foizlari; yo'q — null (smeta podvali). `holat` 'xato' bo'lsa chaqiruvchi eski yo'lga qaytmaydi:
 * u «podval o'qilmadi» deb ko'rsatadi (NULL ≠ "podval yo'q").
 */
export function useAktPodvallar(obyektId: number | null | undefined) {
  const ctx = useContext(QueryClientContext);
  const klient = ctx ?? BOSH_KLIENT;
  const oid = obyektId != null && Number.isFinite(obyektId) && obyektId > 0 ? obyektId : null;
  const q = useQuery({
    queryKey: ['akt-podvallar', oid], enabled: !!ctx && oid != null, staleTime: 30_000, retry: false,
    queryFn: async () => { const r = await aktPodvallariniOl(oid!); if (!r.ok) throw new Error(r.error || 'PODVAL_OQILMADI'); return r.podvallar; },
  }, klient);
  const xarita = useMemo(() => aktPodvalXaritasi(q.data ?? []), [q.data]);
  const nkOl = useCallback((aktId: number, blok = ''): AktPodvalNk | null => xarita.get(`${aktId}:${blok}`)?.nk ?? null, [xarita]);
  const qatorOl = useCallback((aktId: number, blok = ''): AktPodvalQator | null => xarita.get(`${aktId}:${blok}`) ?? null, [xarita]);
  const holat: 'yuklanmoqda' | 'tayyor' | 'xato' = !ctx ? 'yuklanmoqda' : q.isError ? 'xato' : q.isSuccess ? 'tayyor' : 'yuklanmoqda';
  return { holat, podvallar: q.data ?? [], nkOl, qatorOl, qayta: () => { void q.refetch(); } };
}