import { useContext, useEffect, useState } from 'react';
import { QueryClientContext, type QueryClient } from '@tanstack/react-query';
import { sbT2ObyektlarOlKomp, type SbJavob, type T2Obyekt } from './supabase';

/**
 * Kompaniya obyektlari ro'yxati (`t2_obyekt_jami`) — sahifalar orasida bitta react-query kaliti.
 * Sabab (2026-10-30, demo qotishi): Holat, Fakt, Nakopitelniy va PTO kontekst har biri shu og'ir view'ni
 * alohida so'rardi. Endi 60 s ichida bir marta o'qiladi. Provider'siz (izolyatsiyalangan test) — to'g'ridan-to'g'ri o'qish.
 */
export const OBYEKTLAR_STALE_MS = 60_000;
export const obyektlarKaliti = (kompaniyaId: number) => ['t2-obyektlar', kompaniyaId] as const;

export function useIxtiyoriyQueryClient(): QueryClient | null {
  return useContext(QueryClientContext) ?? null;
}

/** Keshdan (yangi bo'lsa) yoki serverdan; xato keshlanmaydi. `majburiy` — kesh e'tiborsiz (qo'lda yangilash). */
export async function obyektlarKeshdan(
  qc: QueryClient | null | undefined, kompaniyaId: number, majburiy = false,
): Promise<SbJavob<T2Obyekt>> {
  if (!qc) return sbT2ObyektlarOlKomp(kompaniyaId) as Promise<SbJavob<T2Obyekt>>;
  try {
    const qatorlar = await qc.fetchQuery({
      queryKey: obyektlarKaliti(kompaniyaId),
      staleTime: majburiy ? 0 : OBYEKTLAR_STALE_MS,
      retry: false,
      queryFn: async () => {
        const r = await sbT2ObyektlarOlKomp(kompaniyaId);
        if (!r.ok) throw new Error(r.error || 'OBYEKTLAR_OQILMADI');
        return (r.qatorlar || []) as T2Obyekt[];
      },
    });
    return { ok: true, qatorlar };
  } catch (e) {
    return { ok: false, qatorlar: [], error: e instanceof Error ? e.message : String(e) };
  }
}

/** Sahifa uchun: ro'yxat, xato (faqat shu panelga tegishli) va yuklanish belgisi. */
export function useT2ObyektlarRoyxati(kompaniyaId: number | null | undefined) {
  const qc = useIxtiyoriyQueryClient();
  const boshlangich = () => (kompaniyaId != null ? qc?.getQueryData<T2Obyekt[]>(obyektlarKaliti(kompaniyaId)) : undefined);
  const [holat, setHolat] = useState<{ kid: number | null; obyektlar: T2Obyekt[]; xato: string; yuklanmoqda: boolean }>(() => {
    const b = boshlangich();
    return { kid: kompaniyaId ?? null, obyektlar: b ?? [], xato: '', yuklanmoqda: kompaniyaId != null && !b };
  });
  useEffect(() => {
    let faol = true;
    if (kompaniyaId == null) { setHolat({ kid: null, obyektlar: [], xato: '', yuklanmoqda: false }); return; }
    const b = qc?.getQueryData<T2Obyekt[]>(obyektlarKaliti(kompaniyaId));
    setHolat((eski) => (eski.kid === kompaniyaId ? { ...eski, yuklanmoqda: !b && !eski.obyektlar.length }
      : { kid: kompaniyaId, obyektlar: b ?? [], xato: '', yuklanmoqda: !b }));
    void obyektlarKeshdan(qc, kompaniyaId).then((r) => {
      if (!faol) return;
      if (r.ok) setHolat({ kid: kompaniyaId, obyektlar: (r.qatorlar || []) as T2Obyekt[], xato: '', yuklanmoqda: false });
      else setHolat((eski) => ({ ...eski, kid: kompaniyaId, xato: 'Obyektlar kanonik ro‘yxatdan o‘qilmadi.', yuklanmoqda: false }));
    }).catch(() => { if (faol) setHolat((eski) => ({ ...eski, xato: 'Obyektlar kanonik ro‘yxatdan o‘qilmadi.', yuklanmoqda: false })); });
    return () => { faol = false; };
  }, [qc, kompaniyaId]);
  const mos = holat.kid === (kompaniyaId ?? null);
  return { obyektlar: mos ? holat.obyektlar : [], xato: mos ? holat.xato : '', yuklanmoqda: mos ? holat.yuklanmoqda : kompaniyaId != null };
}
