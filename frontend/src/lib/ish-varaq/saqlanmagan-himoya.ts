/**
 * Saqlanmagan kiritma himoyasi: yangi versiya bannerida ogohlantirish + sahifani tark etishda `beforeunload`.
 * Fakt jurnali va Ish varag'i uchun yagona (xulq FaktJurnal'dagi bilan bir xil).
 */
import { useEffect } from 'react';
import { brauzerXotirasi } from '../fakt-jurnal-qoralama';
import { saqlanmaganIsh } from '../../_shared/versiya';

export function useSaqlanmaganHimoya(kalit: string, ozgarishSoni: number) {
  useEffect(() => {
    saqlanmaganIsh(kalit, ozgarishSoni > 0, { qoralama: brauzerXotirasi() != null });
    return () => saqlanmaganIsh(kalit, false);
  }, [kalit, ozgarishSoni]);
}

export function useSahifaTarkHimoyasi(ozgarishSoni: number) {
  useEffect(() => {
    if (!ozgarishSoni) return;
    const k = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', k);
    return () => window.removeEventListener('beforeunload', k);
  }, [ozgarishSoni]);
}
