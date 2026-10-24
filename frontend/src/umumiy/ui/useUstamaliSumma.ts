import { useCallback, useContext } from 'react';
import { QueryClient, QueryClientContext, useQuery } from '@tanstack/react-query';
import { t2ObyektNakrutka } from '../../api/t2-nakrutka';
import { podvalTanla, sbPodvallarOl } from '../../api/t2-nakrutka-podval';
import { limitedRead } from '../../components/pto-workspace/useMarkupTotals';
import { ustamaliHisobla, type KatKesim, type UstamaNatija } from '../../lib/ustamali-summa';
import type { Podval } from '../../lib/nakrutka-konstruktor';
import { useKompaniya } from '../kontekst/KompaniyaKontekst';

export type UstamaHolat = 'yuklanmoqda' | 'tayyor' | 'xato';

const BOSH_KLIENT = new QueryClient();
function useMavjudKlient(): { klient: QueryClient; bor: boolean } {
  const ctx = useContext(QueryClientContext);
  return { klient: ctx ?? BOSH_KLIENT, bor: !!ctx };
}

/**
 * `useUstamaliSumma(obyektId)` — obyektning ustama koeffitsientlari (t2_obyekt_nakrutka_v1: obyekt + shartnoma
 * bo‘yicha) va amaldagi nakrutka podvali bir marta o‘qiladi; `hisobla(katKesim)` har kategoriya bo‘yicha
 * to‘g‘ri xarajatdan ustamali summani (ИТОГО-4, QQS siz) + zanjirni beradi. Yangi formula yo‘q — `ustamaliHisobla`
 * mavjud kaskadni (Nakopitelniy bilan bir xil) chaqiradi. Bir obyekt uchun so‘rov react-query orqali bo‘lishiladi.
 */
export function useUstamaliSumma(obyektId: number | null | undefined, opts: { kompaniyaId?: number | null; shartnomaId?: number | null } = {}) {
  const { joriyId } = useKompaniya();
  // Ilovada QueryClientProvider doim bor; provider'siz (izolyatsiyalangan test) so‘rov yuborilmaydi — «hisoblanmoqda» holati.
  const { klient, bor } = useMavjudKlient();
  const kid = opts.kompaniyaId ?? joriyId ?? null;
  const sid = opts.shartnomaId ?? null;
  const oid = obyektId != null && Number.isFinite(obyektId) && obyektId > 0 ? obyektId : null;
  const nak = useQuery({
    queryKey: ['ustama-nakrutka', oid, sid], enabled: bor && oid != null, staleTime: 60_000, retry: false,
    queryFn: ({ signal }) => limitedRead(async () => {
      const r = await t2ObyektNakrutka(oid!, sid);
      if (!r.ok || !r.koeffitsientlar) throw new Error('USTAMA_KOEF_OQILMADI');
      return r;
    }, signal),
  }, klient);
  // Kalit useMarkupTotals bilan bir xil — ro‘yxat bir marta o‘qiladi.
  const pod = useQuery({
    queryKey: ['pto-markup-podvals', kid], enabled: bor && kid != null, staleTime: 60_000, retry: false,
    queryFn: async () => {
      const r = await sbPodvallarOl(kid!);
      if (!r.ok || r.toliq === false || !Array.isArray(r.qatorlar)) throw new Error('PODVAL_READ_FAILED');
      return r.qatorlar;
    },
  }, klient);
  const holat: UstamaHolat = !bor ? 'yuklanmoqda' : oid == null || kid == null || nak.isError || pod.isError ? 'xato'
    : nak.isSuccess && pod.isSuccess ? 'tayyor' : 'yuklanmoqda';
  const podval: Podval | null = (() => {
    if (!pod.data || oid == null) return null;
    const p = podvalTanla(pod.data, { obyektId: oid, shartnomaId: sid });
    return p ? { versiya: 1, nom: p.nom, qatorlar: p.qatorlar } : null;
  })();
  const koef = nak.data?.koeffitsientlar ?? null;
  const hisobla = useCallback((kesim: KatKesim): UstamaNatija | null => (holat === 'tayyor' ? ustamaliHisobla(kesim, koef, podval) : null), [holat, koef, podval]);
  const retry = useCallback(() => { void nak.refetch(); void pod.refetch(); }, [nak, pod]);
  return { holat, koef, podval, hisobla, retry };
}
