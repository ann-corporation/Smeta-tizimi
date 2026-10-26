import { useContext, useMemo } from 'react';
import { QueryClient, QueryClientContext, useQueries, useQuery } from '@tanstack/react-query';
import { t2ObyektNakrutka } from '../../api/t2-nakrutka';
import { podvalTanla, sbPodvallarOl } from '../../api/t2-nakrutka-podval';
import { limitedRead } from '../../components/pto-workspace/useMarkupTotals';
import { katKesimServerdan, ustamaliHisobla } from '../../lib/ustamali-summa';
import { useKompaniya } from '../kontekst/KompaniyaKontekst';

export type PortfelObyekt = { obyektId: number; shartnomaId?: number | null };
export type PortfelUstamali = {
  holat: 'yuklanmoqda' | 'tayyor' | 'xato';
  /** Ustamali (ИТОГО-4, QQS siz) — faqat hisoblangan obyektlar yig‘indisi; hech biri hisoblanmasa null. */
  ustamali: number | null;
  /** Shu obyektlarning server bo‘yicha to‘g‘ridan-to‘g‘ri xarajati (ustamasiz). */
  ustamasiz: number | null;
  ndsBilan: number | null;
  /** Ustamali hisoblanmagan obyektlar soni (koef/podval yo‘q yoki o‘qilmadi) — ular yig‘indiga kirmagan. */
  nomalumSoni: number;
  /** Ustamali hisoblangan obyektlarning ustamasiz qismi (qisman holatda taxminiy jamini tuzish uchun). */
  hisoblanganUstamasiz: number;
  jamiSoni: number;
  /** Obyekt bo‘yicha ustamali (null — noma’lum). */
  boYicha: Map<number, number | null>;
  retry: () => void;
};

const BOSH = new QueryClient();

/**
 * Bir nechta obyekt (portfel, loyiha, ro‘yxat) uchun ustamali jami — `useUstamaliSumma` bilan AYNAN bir xil hisob
 * (server kategoriya kesimi → `ustamaliHisobla`, podval bo‘lsa u bo‘yicha). Yangi formula yo‘q; so‘rov kalitlari
 * useUstamaliSumma bilan bir xil, shuning uchun bir obyekt bir marta o‘qiladi. Noma’lum obyekt 0 deb olinmaydi.
 */
export function usePortfelUstamali(obyektlar: readonly PortfelObyekt[], opts: { kompaniyaId?: number | null } = {}): PortfelUstamali {
  const { joriyId } = useKompaniya();
  const ctx = useContext(QueryClientContext);
  const klient = ctx ?? BOSH;
  const bor = !!ctx;
  const kid = opts.kompaniyaId ?? joriyId ?? null;
  const royxat = useMemo(() => {
    const m = new Map<string, PortfelObyekt>();
    for (const o of obyektlar) if (o.obyektId > 0 && Number.isFinite(o.obyektId)) m.set(`${o.obyektId}:${o.shartnomaId ?? ''}`, o);
    return [...m.values()];
  }, [obyektlar]);
  const pod = useQuery({
    queryKey: ['pto-markup-podvals', kid], enabled: bor && kid != null, staleTime: 60_000, retry: false,
    queryFn: async () => {
      const r = await sbPodvallarOl(kid!);
      if (!r.ok || r.toliq === false || !Array.isArray(r.qatorlar)) throw new Error('PODVAL_READ_FAILED');
      return r.qatorlar;
    },
  }, klient);
  const nak = useQueries({
    queries: royxat.map((o) => ({
      queryKey: ['ustama-nakrutka', o.obyektId, o.shartnomaId ?? null], enabled: bor, staleTime: 60_000, retry: false,
      queryFn: ({ signal }: { signal: AbortSignal }) => limitedRead(async () => {
        const r = await t2ObyektNakrutka(o.obyektId, o.shartnomaId ?? null);
        if (!r.ok || !r.koeffitsientlar) throw new Error('USTAMA_KOEF_OQILMADI');
        return r;
      }, signal),
    })),
  }, klient);

  const kutyapti = !bor || pod.isPending || nak.some((q) => q.isPending);
  const boYicha = new Map<number, number | null>();
  let ustamali = 0, ustamasiz = 0, hisUs = 0, nds = 0, hisoblandi = 0, nomalum = 0, ustamasizBor = false;
  royxat.forEach((o, i) => {
    const r = nak[i]?.data;
    if (!r?.cats || !pod.data) { boYicha.set(o.obyektId, null); nomalum++; return; }
    const kesim = katKesimServerdan(r.cats);
    const p = podvalTanla(pod.data, { obyektId: o.obyektId, shartnomaId: o.shartnomaId ?? null });
    const u = ustamaliHisobla(kesim, r.koeffitsientlar, p ? { versiya: 1, nom: p.nom, qatorlar: p.qatorlar } : null);
    ustamasiz += u.ustamasiz; ustamasizBor = true;
    if (u.ustamali == null) { boYicha.set(o.obyektId, null); nomalum++; return; }
    boYicha.set(o.obyektId, u.ustamali);
    ustamali += u.ustamali; hisUs += u.ustamasiz; nds += u.ndsBilan ?? 0; hisoblandi++;
  });
  const xato = !kutyapti && (pod.isError || nak.some((q) => q.isError));
  return {
    holat: kutyapti ? 'yuklanmoqda' : xato && hisoblandi === 0 ? 'xato' : 'tayyor',
    ustamali: hisoblandi > 0 ? ustamali : null,
    ustamasiz: ustamasizBor ? ustamasiz : null,
    ndsBilan: hisoblandi > 0 ? nds : null,
    nomalumSoni: nomalum,
    hisoblanganUstamasiz: hisUs,
    jamiSoni: royxat.length,
    boYicha,
    retry: () => { void pod.refetch(); nak.forEach((q) => { void q.refetch(); }); },
  };
}
