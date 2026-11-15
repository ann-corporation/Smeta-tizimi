import { useEffect, useState } from 'react';

/** Teginish ekranimi (telefon/planshet) — ekran klaviaturasi bor qurilma. matchMedia yo'q muhitda false. */
export function sensorliQurilma(): boolean {
  if (typeof window === 'undefined') return false;
  /* Android WebView ba'zan pointer:fine qaytaradi, shuning uchun bir nechta mustaqil belgi: pointer/any-pointer coarse, maxTouchPoints,
   * mobil User-Agent, telefon eni (<640px). Desktop (>=1024px, sichqoncha) uchun hech qaysi belgi yo'q. */
  try { if (typeof window.matchMedia === 'function' && (window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(any-pointer: coarse)').matches)) return true; } catch { /* matchMedia yo'q */ }
  try { if ((navigator.maxTouchPoints ?? 0) > 0) return true; } catch { /* navigator yo'q */ }
  try { if (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent ?? '')) return true; } catch { /* navigator yo'q */ }
  return window.innerWidth < 640;
}

export type KorinishOlchami = { balandlik: number; yuqori: number };

/**
 * Haqiqiy ko'rinadigan maydon (visualViewport): ekran klaviaturasi ochilganda qisqaradi. To'liq ekranli panel shu
 * balandlik bilan o'lchanadi — kiritish maydoni klaviatura ostida qolmaydi, sarlavha tepada turadi.
 * visualViewport yo'q muhitda (test/eski brauzer) — null (CSS 100dvh ishlatiladi).
 */
export function useKorinishOlchami(faol: boolean): KorinishOlchami | null {
  const [olcham, setOlcham] = useState<KorinishOlchami | null>(null);
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!faol || !vv) { setOlcham(null); return; }
    const yangila = () => setOlcham((eski) => {
      const yangi = { balandlik: Math.round(vv.height), yuqori: Math.round(vv.offsetTop) };
      return eski && eski.balandlik === yangi.balandlik && eski.yuqori === yangi.yuqori ? eski : yangi;
    });
    yangila();
    vv.addEventListener('resize', yangila);
    vv.addEventListener('scroll', yangila);
    return () => { vv.removeEventListener('resize', yangila); vv.removeEventListener('scroll', yangila); };
  }, [faol]);
  return olcham;
}