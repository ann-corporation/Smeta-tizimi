import { createContext } from 'react';

/** Bitta sidebar bandi ostidagi tab (sahifa) — AdminShell `TIZIM_02_GURUHLAR` dagi `tablar`. */
export type BolimTab = { yol: string; nom: string };

/** AdminShell beradi: rol/ruxsat/modul filtridan o'tgan tab guruhlari (sidebar bilan bir manba). */
export const BolimTablariKontekst = createContext<BolimTab[][]>([]);

/** Joriy yo'l qaysi tab guruhiga tegishli (topilmasa — null). */
export function joriyTabGuruhi(guruhlar: BolimTab[][], pathname: string): BolimTab[] | null {
  return guruhlar.find((g) => g.some((tb) => pathname === tb.yol || pathname.startsWith(tb.yol + '/'))) ?? null;
}
