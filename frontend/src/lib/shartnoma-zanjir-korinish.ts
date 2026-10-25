/**
 * Shartnoma zanjiri ko'rinishi (egasi 2026-10-25: «har ekran o'zini o'zi tushuntirsin»):
 * shartnoma (+DS) → tasdiqlangan F2 → F3 (sotuv) → to'lov → akt-sverka qoldig'i — bitta chiziqda.
 * Yangi hisob YO'Q: hammasi lib/nakopitelniy-svod (shartnomaSvodi) natijasidan; bu yerda faqat chizish ulushlari.
 * NULL ≠ 0: shartnoma summasi noma'lum bo'lsa — foiz va qoldiq ham noma'lum (null).
 */
import { somga, type ShartnomaSvodi } from './nakopitelniy-svod';

export type HisobChizigi = {
  /** So'mda (QQS bilan). */
  shartnoma: number | null; f3: number; tolov: number;
  /** Shartnoma bo'yicha hali hisob (F3) qilinmagan; noma'lum — null; oshgan bo'lsa manfiy. */
  qolgan: number | null;
  /** F3 / shartnoma, %; noma'lum — null. */
  foiz: number | null;
  /** Chizish uchun 0..1: to'langan qism (F3 ichida) va to'lanmagan F3 qismi. */
  tolovUlush: number; qarzUlush: number;
  oshdi: boolean;
};

export function hisobChizigi(sv: Pick<ShartnomaSvodi, 'joriy' | 'f3' | 'tolov'>): HisobChizigi {
  const shartnoma = sv.joriy.summa;
  const f3 = somga(sv.f3); const tolov = somga(sv.tolov);
  if (shartnoma == null || shartnoma <= 0) return { shartnoma, f3, tolov, qolgan: null, foiz: null, tolovUlush: 0, qarzUlush: 0, oshdi: false };
  const f3U = Math.min(1, Math.max(0, f3 / shartnoma));
  const tolovUlush = Math.min(f3U, Math.max(0, tolov / shartnoma));
  return { shartnoma, f3, tolov, qolgan: shartnoma - f3, foiz: (f3 / shartnoma) * 100, tolovUlush, qarzUlush: Math.max(0, f3U - tolovUlush), oshdi: f3 > shartnoma + 0.005 };
}

/** Akt-sverka qoldig'i yozuvi: «+» — buyurtmachi qarzi, «−» — ishlanmagan avans, 0 — teng. */
export function qoldiqMazmuni(qoldiqTiyin: number): 'buyurtmachi_qarzi' | 'avans' | 'teng' {
  if (qoldiqTiyin > 0) return 'buyurtmachi_qarzi';
  if (qoldiqTiyin < 0) return 'avans';
  return 'teng';
}
