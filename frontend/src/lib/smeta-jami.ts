/**
 * «SMETA JAMI» JUFTLIGI (egasi 2026-11-13): katta raqam — ASL (shartnoma) smeta: qo‘shimcha/zamena qatorlari kirmaydi;
 * yonida kichik — JORIY smeta (qo‘shimcha ishlar bilan). Ikkalasi aniq yorliq bilan. Teng bo‘lsa — bitta son.
 * Noma’lum = null («noma’lum»), hech qachon 0 emas. Ma’lumot — serverning summa paketi (`SummaPaket`), qayta hisoblanmaydi.
 * `joriy === undefined` — bu manba joriyni yuklamagan (ko‘rsatilmaydi); `null` — noma’lum.
 */
import { foiz, type SummaPaket } from './summa-paket';

export type SmetaJuftlik = { asl: SummaPaket | null; joriy: SummaPaket | null | undefined };

export function smetaJuftlik(asl: SummaPaket | null | undefined, joriy?: SummaPaket | null): SmetaJuftlik {
  return { asl: asl ?? null, joriy };
}

/** Asl va joriy bir xilmi (QQS bilan, 1 so‘m aniqlikda). Biri noma’lum/yuklanmagan — false. */
export function smetaTengmi(j: SmetaJuftlik): boolean {
  if (!j.asl || !j.joriy) return false;
  return Math.abs(j.asl.qqs_bilan - j.joriy.qqs_bilan) <= 1;
}

export type SmetaNisbat = { asl: number | null; joriy: number | null; /** joriy ≠ asl — ikkinchi nisbat ham ko‘rsatiladi. */ ikkinchiBor: boolean };

/** «X / smeta %» — sukut asos ASL smeta; joriy ≠ asl bo‘lsa ikkinchi nisbat ham (chalg‘ituvchi 651% emas). */
export function smetaNisbat(surat: number | null | undefined, aslSumma: number | null | undefined, joriySumma: number | null | undefined): SmetaNisbat {
  const a = foiz(surat, aslSumma);
  const bor = joriySumma != null && aslSumma != null && Math.abs(joriySumma - aslSumma) > 1;
  return { asl: a, joriy: bor ? foiz(surat, joriySumma) : null, ikkinchiBor: bor };
}
