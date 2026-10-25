import { createContext } from 'react';

/** Bitta sidebar bandi ostidagi tab (sahifa) — AdminShell `TIZIM_02_GURUHLAR` dagi `tablar`. */
export type BolimTab = { yol: string; nom: string };

/** AdminShell beradi: rol/ruxsat/modul filtridan o'tgan tab guruhlari (sidebar bilan bir manba). */
export const BolimTablariKontekst = createContext<BolimTab[][]>([]);

/** Joriy yo'l qaysi tab guruhiga tegishli (topilmasa — null). */
export function joriyTabGuruhi(guruhlar: BolimTab[][], pathname: string): BolimTab[] | null {
  return guruhlar.find((g) => g.some((tb) => pathname === tb.yol || pathname.startsWith(tb.yol + '/'))) ?? null;
}

/* ── Har tabning «oxirgi URL» xotirasi (JQA-07) ──
 * Tab almashganda sahifa unmount bo'ladi; uning URL'dagi holati (masalan F2 import `?job=…&akt=…`) yo'qolmasin.
 * Xotira kompaniya + obyekt + tab yo'li bo'yicha chegaralangan (sessionStorage — tab/oyna doirasida), shuning uchun
 * bir obyektning job'i boshqa obyekt/kompaniyaga ko'chmaydi. Boshqa marshrutlarga hech narsa ko'r-ko'rona o'tkazilmaydi:
 * faqat o'sha tabning o'z oxirgi query'si o'ziga qaytariladi. */
const XOTIRA_PREFIKS = 't2_bolim_tab';

export function tabXotiraKaliti(kompaniyaId: number | null, obyektId: number | null, yol: string): string {
  return `${XOTIRA_PREFIKS}:${kompaniyaId ?? 0}:${obyektId ?? 0}:${yol}`;
}

export function tabXotiraOl(kalit: string): string | null {
  try { return sessionStorage.getItem(kalit); } catch { return null; }
}

export function tabXotiraYoz(kalit: string, search: string): void {
  try { if (search) sessionStorage.setItem(kalit, search); else sessionStorage.removeItem(kalit); } catch { /* saqlab bo'lmasa — scope bilan ochiladi */ }
}
