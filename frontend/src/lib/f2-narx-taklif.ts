/**
 * F2 tayyorlashda narx taklifi (egasi ruxsati, 2026-10-01): FAQAT operator "Narxlarni taklif qilish"ni
 * bosganda, hajmi kiritilgan va narxi BO'SH qatorlarga. Tartib:
 *   1) shu qatorning oldingi tasdiqlangan F2 narxi;  2) katalog narxi;  3) smeta narxi.
 * Har tanlov manbasi bilan qaytadi (UI'da ko'rinadi, operator tahrirlaydi) — jim to'ldirish yo'q.
 * Summa Postgres numeric bilan bir xil yaxlitlanadi (hujjat va sayt bir xil).
 */
import { pulYaxlit } from './ish-abc';

export type F2NarxManba = 'oldingi_f2' | 'katalog' | 'smeta';
export const F2_NARX_MANBA_NOMI: Record<F2NarxManba, string> = { oldingi_f2: 'oldingi F2', katalog: 'katalog', smeta: 'smeta narxi' };

export function f2NarxTanla(p: { f2Narx?: number | null; katalogNarx?: number | null; smetaNarx?: number | null }): { narx: number; manba: F2NarxManba } | null {
  const ok = (v: number | null | undefined): v is number => v != null && Number.isFinite(v) && v > 0;
  if (ok(p.f2Narx)) return { narx: p.f2Narx, manba: 'oldingi_f2' };
  if (ok(p.katalogNarx)) return { narx: p.katalogNarx, manba: 'katalog' };
  if (ok(p.smetaNarx)) return { narx: p.smetaNarx, manba: 'smeta' };
  return null;
}

/** Hajm × narx → hujjat summasi (2 xona, Postgres bilan bir xil). */
export function f2Summa(hajm: number, narx: number): number {
  return pulYaxlit(hajm * narx);
}
