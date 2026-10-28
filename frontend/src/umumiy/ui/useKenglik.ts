import { useEffect, useRef, useState } from 'react';

/**
 * Konteyner enini piksellarda kuzatadi (ResizeObserver). SVG grafiklar `viewBox` ni shu enga teng qilib chizadi —
 * shunda grafik ekranga qarab kengayadi, lekin yozuv/chiziq/ustun o'lchamlari CHO'ZILMAYDI (egasi 2026-10-27:
 * «grafiklar chiroyli emas, masshtab rasvo» — avval 760px viewBox katta ekranda 2,5× kattalashib ketardi).
 */
export function useKenglik<T extends HTMLElement>(standart = 760) {
  const ref = useRef<T>(null);
  const [kenglik, setKenglik] = useState(standart);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const olch = () => { const w = el.clientWidth; if (w > 0) setKenglik(Math.round(w)); };
    olch();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(olch);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, kenglik] as const;
}
