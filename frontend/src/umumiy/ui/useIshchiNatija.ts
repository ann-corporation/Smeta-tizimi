import { useEffect, useRef } from 'react';
import { aiIshchiOl, type NatijaQatori } from '../../api/ai-ishchi';

/** Yengil polling oralig'i: panel ochiq va sahifa ko'rinib turganda. */
export const ISHCHI_POLL_MS = 60_000;
export const ISHCHI_HODISA = 'ai:ishchi-natija';
export type IshchiHodisa = { id: number; ishchi: string; sarlavha: string; xulosa: string };

/**
 * AI ishchi natijasi tayyor bo'lganda Jarvis chatida xabar: panel OCHIQ bo'lsa har ISHCHI_POLL_MS da inbox (faqat «yangi») o'qiladi.
 * Birinchi o'qish — asos (eski natijalar xabar bo'lmaydi); keyin paydo bo'lgan har yangi natija `ai:ishchi-natija` hodisasi bilan chatga uzatiladi.
 * Xato/ruxsat yo'q — jim (chat ishlayveradi). Panel yopiq yoki sahifa yashirin bo'lsa so'rov YO'Q.
 */
export function useIshchiNatija(kompaniyaId: number | null, faol: boolean, poll = ISHCHI_POLL_MS): void {
  const korilgan = useRef<{ kid: number | null; idlar: Set<number> | null }>({ kid: null, idlar: null });
  useEffect(() => {
    if (kompaniyaId == null || !faol) return undefined;
    if (korilgan.current.kid !== kompaniyaId) korilgan.current = { kid: kompaniyaId, idlar: null };
    let tirik = true;
    const bir = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const r = await aiIshchiOl('inbox', kompaniyaId, 'yangi').catch(() => null);
      if (!tirik || !r || !r.ok) return;
      const royxat: NatijaQatori[] = r.data.royxat ?? [];
      const bor = korilgan.current.idlar;
      if (bor) {
        for (const x of royxat) if (!bor.has(x.id)) window.dispatchEvent(new CustomEvent<IshchiHodisa>(ISHCHI_HODISA, { detail: { id: x.id, ishchi: x.ishchi_kod, sarlavha: x.sarlavha, xulosa: x.xulosa } }));
      }
      korilgan.current.idlar = new Set([...(bor ?? []), ...royxat.map((x) => x.id)]);
    };
    void bir();
    const iv = setInterval(() => { void bir(); }, poll);
    return () => { tirik = false; clearInterval(iv); };
  }, [kompaniyaId, faol, poll]);
}
