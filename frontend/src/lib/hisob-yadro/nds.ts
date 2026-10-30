import { yaxlit2 } from './yaxlit';

/**
 * QQS (НДС) — YAGONA manba. Qonuniy sukut stavka (12 %) faqat shu konstantadan olinadi; kodda «12» yozilmaydi.
 * Yadro o'zi hech qachon sukutni qo'ymaydi: stavka noma'lum bo'lsa natijada QQS = null (aniq «noma'lum»).
 * Sukutni faqat hujjat yozuvchisi (eksport) ochiq-oydin `NDS_SUKUT_FOIZ` bilan beradi.
 */
export const NDS_SUKUT_FOIZ = 12;

/** QQS summasi = ROUND(asos × foiz/100, 2). Asos yoki foiz noma'lum — null. */
export function qqsSumma(asos: number | null | undefined, foiz: number | null | undefined): number | null {
  if (asos == null || foiz == null || !Number.isFinite(asos) || !Number.isFinite(foiz)) return null;
  return yaxlit2((asos * foiz) / 100);
}

/** QQS bilan = asos + ROUND(asos × foiz/100, 2) (Excel podvali bilan bir xil qadam). */
export function qqsBilan(asos: number | null | undefined, foiz: number | null | undefined): number | null {
  const q = qqsSumma(asos, foiz);
  return q == null || asos == null ? null : yaxlit2(asos + q);
}

/** Yaroqli stavka (0 ≤ foiz < 100) yoki null. */
export function ndsFoizTozala(x: unknown): number | null {
  const n = x == null || x === '' ? NaN : Number(x);
  return Number.isFinite(n) && n >= 0 && n < 100 ? n : null;
}

/** Sukut stavka ulush sifatida (0,12) — `NDS_SUKUT_FOIZ` dan. */
export const NDS_SUKUT_ULUSH = NDS_SUKUT_FOIZ / 100;

/** QQS koeffitsienti (1 + foiz/100). Foiz noma'lum — null. */
export function qqsKoef(foiz: number | null | undefined): number | null {
  return foiz == null || !Number.isFinite(foiz) ? null : 1 + foiz / 100;
}

/** QQS bilan summadan (tiyinda) [QQS siz, QQS, jami]: QQS siz = ROUND(jami / (1 + st)), QQS = jami − QQS siz (ayirma). */
export function qqsAjratTiyin(jamiTiyin: number, foiz: number): [number, number, number] {
  const siz = Math.round(jamiTiyin / (1 + foiz / 100));
  return [siz, jamiTiyin - siz, jamiTiyin];
}

/** Excel QQS formulasi (kesh — `qqsSumma`): ROUND(asos × foiz / 100, 2). */
export function qqsFormulasi(asosRef: string, foiz: number | string): string {
  return `ROUND(${asosRef}*${foiz}/100,2)`;
}