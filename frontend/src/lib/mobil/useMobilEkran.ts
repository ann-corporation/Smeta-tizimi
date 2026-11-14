import { useEffect, useState } from 'react';

/** Telefon qobig'i chegarasi (px): shundan tor ekranda pastki tab-panel va ixcham yuqori panel. Planshet (768+) va desktop o'zgarmaydi. */
export const MOBIL_ENI = 768;
const SORAV = `(max-width: ${MOBIL_ENI - 1}px)`;

function hozirgi(): boolean {
  try { return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(SORAV).matches; } catch { return false; }
}

/** Ekran telefon eniga tushdimi (matchMedia; o'zgarishga obuna). matchMedia yo'q muhitda (SSR/test) — false. */
export function useMobilEkran(): boolean {
  const [mobil, setMobil] = useState<boolean>(hozirgi);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(SORAV);
    const f = () => setMobil(mq.matches);
    f();
    mq.addEventListener?.('change', f);
    return () => mq.removeEventListener?.('change', f);
  }, []);
  return mobil;
}