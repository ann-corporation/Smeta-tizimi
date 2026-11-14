/**
 * «PUL BO‘YICHA YOPILADIGAN ISH» (egasi 2026-11-13): smeta qatori pul bilan o‘lchanadi — birlik «сум»
 * (yoki «сўм», «so‘m», «sum», «UZS»), narx = 1, hajm = pul summasi (masalan, tafsilotli smetasi yo‘q pudrat haqi).
 * Bunday qator qonuniy; lekin pulni jismoniy hajm deb olib hisoblasak hajm/narx farqi ma’nosiz sonlar beradi.
 * Shuning uchun: hajm va narx farqi hisobiga KIRMAYDI (farq = NULL, «qo‘llanmaydi», hech qachon 0 emas);
 * bajarilish — yopilgan pul foizi. Tasdiqlangan aktlar va ma’lumot O‘ZGARTIRILMAYDI.
 * SQL ko‘zgusi: `public.t2_pul_bilan_yopiladi_v1(birlik, narx)` (20261219000000_t2_pul_bilan_yopiladi_v1.sql) — bir xil qoida.
 */

/** Birlik yozuvini solishtirish shakliga keltirish: kichik harf, bo‘sh joy/nuqta/apostrof olib tashlanadi. */
export function birlikShakli(birlik: string | null | undefined): string {
  return (birlik ?? '').toLowerCase().replace(/[\s.'’ʻʼ‘`]/g, '');
}

const PUL_BIRLIKLARI: ReadonlySet<string> = new Set(['сум', 'сўм', 'som', 'sum', 'uzs']);

/** Birlik so‘m (pul) ma’nosidami. */
export function pulBirligimi(birlik: string | null | undefined): boolean {
  return PUL_BIRLIKLARI.has(birlikShakli(birlik));
}

/** Yagona qoida: birlik pul VA narx aynan 1. Narx noma’lum (null/NaN) — emas. */
export function pulBilanYopiladi(birlik: string | null | undefined, narx: number | string | null | undefined): boolean {
  if (narx == null || narx === '') return false;
  const n = typeof narx === 'number' ? narx : Number(narx);
  return Number.isFinite(n) && n === 1 && pulBirligimi(birlik);
}

/**
 * Narx farqi (haqiqiy − bazaviy). Pul bo‘yicha yopiladigan qatorda yoki biror qiymat noma’lum bo‘lsa — null
 * («qo‘llanmaydi»), hech qachon 0 emas.
 */
export function narxFarqi(
  q: { birlik?: string | null; narx?: number | null },
  haqiqiy: number | null | undefined, bazaviy: number | null | undefined,
): number | null {
  if (pulBilanYopiladi(q.birlik, q.narx)) return null;
  if (haqiqiy == null || bazaviy == null || !Number.isFinite(haqiqiy) || !Number.isFinite(bazaviy)) return null;
  return haqiqiy - bazaviy;
}

/** Bajarilish foizi (bir xona): pul qatorida — yopilgan pul / reja pul; boshqasida — hajm bo‘yicha. Maxraj 0/noma’lum — null. */
export function bajarilishFoizi(
  q: { birlik?: string | null; narx?: number | null; hajm?: number | null; summa?: number | null },
  bajarilganHajm: number | null | undefined, bajarilganSumma: number | null | undefined,
): number | null {
  const pul = pulBilanYopiladi(q.birlik, q.narx);
  const reja = pul ? q.summa : q.hajm;
  const bor = pul ? bajarilganSumma : bajarilganHajm;
  if (reja == null || bor == null || !Number.isFinite(reja) || !Number.isFinite(bor) || reja === 0) return null;
  return Math.round((bor / reja) * 1000) / 10;
}
