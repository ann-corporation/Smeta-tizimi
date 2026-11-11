import { useContext, useMemo } from 'react';
import { QueryClient, QueryClientContext, useQueries, useQuery } from '@tanstack/react-query';
import { t2ObyektNakrutka } from '../../api/t2-nakrutka';
import { podvalTanla, sbPodvallarOl } from '../../api/t2-nakrutka-podval';
import { limitedRead } from '../../components/pto-workspace/useMarkupTotals';
import { obyektKesimi, ustamaliHisobla } from '../../lib/ustamali-summa';
import { rahbarPanelOl } from '../../api/t2-rahbar-panel';
import { useKompaniya } from '../kontekst/KompaniyaKontekst';
import { USTAMA_STALE_MS } from './ustama-kesh';

export type PortfelObyekt = { obyektId: number; shartnomaId?: number | null; /** Tafsilotda ko‘rsatiladigan nom (ixtiyoriy). */ nom?: string | null };
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
  /** Obyekt bo‘yicha QQS bilan (ВСЕГО; null — noma’lum). Egasi 2026-10-27: jami qiymatning asosiy raqami. */
  qqsBoYicha: Map<number, number | null>;
  /** Obyekt bo‘yicha ustamasiz (to‘g‘ri xarajat, server kesimidan; null — o‘qilmadi). */
  ustamasizBoYicha: Map<number, number | null>;
  /** Ro‘yxat (takrorsiz) — tafsilot tarkibi uchun. */
  royxat: readonly PortfelObyekt[];
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
  /* YAGONA MANBA (HISOB_YADRO_V1): shartnomasiz obyektlarning smetasi — serverning summa paketi (rahbar paneli obyektlar[].smeta,
     _t2_summa_paket_v1). Avval har obyekt alohida /nakrutka so'rovi bilan mijozda hisoblanardi: so'rovlar kelishiga qarab jami
     tashrif orasida o'zgarardi va dashboarddagi smeta kartasidan farq qilardi. Panel o'qilmasa — eski yo'l (zaxira). */
  const panel = useQuery({
    queryKey: ['rahbar-panel-v1', kid, null, null, null], enabled: bor && kid != null, staleTime: 60_000, retry: 1,
    queryFn: async () => {
      const r = await rahbarPanelOl({ kompaniyaId: kid as number, davrDan: null, davrGacha: null, obyektId: null });
      if (!r.ok) throw new Error(r.error);
      return r.natija;
    },
  }, klient);
  const panelKutish = bor && kid != null && panel.isPending;
  const paketlar = useMemo(() => new Map((panel.data?.obyektlar ?? []).map((x) => [x.obyekt_id, x.smeta] as const)), [panel.data]);
  const paketdan = (o: PortfelObyekt) => (o.shartnomaId == null ? paketlar.get(o.obyektId) ?? null : null);
  const zaxira = royxat.filter((o) => !paketdan(o));
  const pod = useQuery({
    queryKey: ['pto-markup-podvals', kid], enabled: bor && kid != null && !panelKutish && zaxira.length > 0, staleTime: 60_000, retry: false,
    queryFn: async () => {
      const r = await sbPodvallarOl(kid!);
      if (!r.ok || r.toliq === false || !Array.isArray(r.qatorlar)) throw new Error('PODVAL_READ_FAILED');
      return r.qatorlar;
    },
  }, klient);
  const nak = useQueries({
    queries: royxat.map((o) => ({
      queryKey: ['ustama-nakrutka', o.obyektId, o.shartnomaId ?? null], enabled: bor && !panelKutish && !paketdan(o), staleTime: USTAMA_STALE_MS, retry: false,
      queryFn: ({ signal }: { signal: AbortSignal }) => limitedRead(async () => {
        const r = await t2ObyektNakrutka(o.obyektId, o.shartnomaId ?? null);
        if (!r.ok || !r.koeffitsientlar) throw new Error('USTAMA_KOEF_OQILMADI');
        return r;
      }, signal),
    })),
  }, klient);

  const kutyapti = !bor || panelKutish || (zaxira.length > 0 && (pod.isPending || zaxira.some((o) => nak[royxat.indexOf(o)]?.isPending)));
  const boYicha = new Map<number, number | null>();
  const qqsBoYicha = new Map<number, number | null>();
  const ustamasizBoYicha = new Map<number, number | null>();
  let ustamali = 0, ustamasiz = 0, hisUs = 0, nds = 0, hisoblandi = 0, nomalum = 0, ustamasizBor = false;
  royxat.forEach((o, i) => {
    const pk = paketdan(o);
    if (pk) {
      ustamasiz += pk.ustamasiz; ustamasizBor = true; ustamasizBoYicha.set(o.obyektId, pk.ustamasiz);
      boYicha.set(o.obyektId, pk.ustamali); qqsBoYicha.set(o.obyektId, pk.qqs_bilan);
      ustamali += pk.ustamali; hisUs += pk.ustamasiz; nds += pk.qqs_bilan; hisoblandi++;
      return;
    }
    const r = nak[i]?.data;
    if (!r?.cats || !pod.data) { boYicha.set(o.obyektId, null); qqsBoYicha.set(o.obyektId, null); nomalum++; return; }
    const kesim = obyektKesimi(r)!;
    const p = podvalTanla(pod.data, { obyektId: o.obyektId, shartnomaId: o.shartnomaId ?? null });
    const u = ustamaliHisobla(kesim, r.koeffitsientlar, p ? { versiya: 1, nom: p.nom, qatorlar: p.qatorlar } : null);
    ustamasiz += u.ustamasiz; ustamasizBor = true; ustamasizBoYicha.set(o.obyektId, u.ustamasiz);
    if (u.ustamali == null) { boYicha.set(o.obyektId, null); qqsBoYicha.set(o.obyektId, null); nomalum++; return; }
    boYicha.set(o.obyektId, u.ustamali);
    qqsBoYicha.set(o.obyektId, u.ndsBilan);
    ustamali += u.ustamali; hisUs += u.ustamasiz; nds += u.ndsBilan ?? 0; hisoblandi++;
  });
  const xato = !kutyapti && zaxira.length > 0 && (pod.isError || zaxira.some((o) => nak[royxat.indexOf(o)]?.isError));
  return {
    holat: kutyapti ? 'yuklanmoqda' : xato && hisoblandi === 0 ? 'xato' : 'tayyor',
    ustamali: hisoblandi > 0 ? ustamali : null,
    ustamasiz: ustamasizBor ? ustamasiz : null,
    ndsBilan: hisoblandi > 0 ? nds : null,
    nomalumSoni: nomalum,
    hisoblanganUstamasiz: hisUs,
    jamiSoni: royxat.length,
    boYicha,
    qqsBoYicha,
    ustamasizBoYicha,
    royxat,
    retry: () => { void panel.refetch(); void pod.refetch(); nak.forEach((q) => { void q.refetch(); }); },
  };
}
