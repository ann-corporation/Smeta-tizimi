/**
 * «Yangi menyu» sozlamasi (ekotizim V2, 2-qadam): 7 ish joyi bilan yangi sidebar. Sukut — YOQIQ; foydalanuvchi sidebar pastidagi
 * tugma bilan eski (guruhli) sidebarga qaytishi mumkin (qaytariladigan: eski komponent bir bayroq narida). Brauzerda eslab qolinadi
 * (xotira yopiq bo'lsa — sukut yoqiq). Server sozlamasi shart emas: bu faqat ko'rinish.
 */
import { useCallback, useEffect, useState } from 'react';

export const YANGI_MENYU_KALIT = 'fz-yangi-menyu';
const HODISA = 'fz-yangi-menyu:ozgardi';

export function yangiMenyuYoqilgan(): boolean {
  try { return localStorage.getItem(YANGI_MENYU_KALIT) !== '0'; } catch { return true; }
}

export function yangiMenyuQoy(yoqiq: boolean): void {
  try { localStorage.setItem(YANGI_MENYU_KALIT, yoqiq ? '1' : '0'); } catch { /* xotira yopiq */ }
  try { window.dispatchEvent(new CustomEvent(HODISA, { detail: yoqiq })); } catch { /* SSR/test */ }
}

export function useYangiMenyu(): [boolean, (v: boolean) => void] {
  const [yoqiq, setYoqiq] = useState<boolean>(yangiMenyuYoqilgan);
  useEffect(() => {
    const f = () => setYoqiq(yangiMenyuYoqilgan());
    window.addEventListener(HODISA, f);
    return () => window.removeEventListener(HODISA, f);
  }, []);
  const qoy = useCallback((v: boolean) => yangiMenyuQoy(v), []);
  return [yoqiq, qoy];
}