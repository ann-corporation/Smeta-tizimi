import { useEffect, useRef } from 'react';
import { friksiyaBoshla, friksiyaKontekst, type Kuzatuv } from './friksiya';

/**
 * Oqimni kuzatadi: `faol` true bo'lganda «boshlandi»; komponent yopilsa/`faol` false bo'lsa va yakun berilmagan bo'lsa — «tashlandi».
 * `kuzatuv()` yakun (`tugadi`) va xato (`xato(kod)`) uchun joriy kuzatuvni qaytaradi (faol bo'lmasa — no-op).
 */
export function useFriksiya(sahifa: string, amal: string, kompaniyaId: number | null | undefined, faol = true): () => Kuzatuv {
  const ref = useRef<Kuzatuv | null>(null);
  useEffect(() => { friksiyaKontekst(kompaniyaId); }, [kompaniyaId]);
  useEffect(() => {
    if (!faol) return undefined;
    const k = friksiyaBoshla(sahifa, amal);
    ref.current = k;
    return () => { k.tashlandi(); if (ref.current === k) ref.current = null; };
  }, [sahifa, amal, faol]);
  return () => ref.current ?? { tugadi: () => undefined, tashlandi: () => undefined, xato: () => undefined, tugagan: () => true };
}
