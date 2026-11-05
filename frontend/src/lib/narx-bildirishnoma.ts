/**
 * Egasi qoidasi (2026-10-08): summalar HAR DOIM ko'rinadi — jamilar ma'lum summalardan yig'iladi. Narxi yo'q qator
 * faqat o'zi bo'sh qoladi va faqat o'sha qator uchun bildirishnoma beriladi. Narx 0 — foydalanuvchi roziligi bilan
 * qo'yilgan haqiqiy narx: 0 sifatida hisoblanadi, bildirishnoma berilmaydi.
 * Mashinistlar mehnat sarfi (ЗАТРАТЫ ТРУДА МАШИНИСТОВ) narxi mashina narxi ichida — bildirishnoma berilmaydi.
 */
export type NarxQator = { kod?: string | null; nom?: string | null };

const MASHINIST = /ЗАТРАТЫ\s+ТРУДА\s+МАШИНИСТ/i;

export function mashinistMehnati(q: NarxQator): boolean {
  return MASHINIST.test(q.nom ?? '');
}

/** Narxsiz qator uchun bildirishnoma kerakmi (narx === null). Narx 0 bo'lsa — kerak emas. */
export function narxBildirishnomaKerak(q: NarxQator, narx: number | null | undefined): boolean {
  return narx == null && !mashinistMehnati(q);
}

export const NARX_YOQ_SABAB = 'цена не указана — строка не включена в сумму (остальные суммы подсчитаны)';

/**
 * Egasi qoidasi (2026-11-06): «tizim narxlanmagan narsalarni bildirishi kerak, xotyabi hujjatlarida bildirishi kerak».
 * YAGONA hujjat belgisi (barcha eksport/chop etish shu yerdan oladi — parallel matn yozilmaydi):
 *  - qator darajasi: narx katagi BO'SH, summa katagi — `NARX_ANIQLANMAGAN` matni (son emas, 0 emas; SUM uni o'tkazadi,
 *    F2 qayta importida bo'sh katak bilan bir xil o'qiladi);
 *  - hujjat darajasi: jamilar yonida `narxsizItogMatni(N)` — faqat N > 0 bo'lsa (`RasmiyVaraq.narxsizOgoh`).
 * Mashinist mehnati (narxi mashina ichida) — narxsiz hisoblanmaydi (`narxBildirishnomaKerak`).
 */
export const NARX_ANIQLANMAGAN = 'цена не определена';

const strokSozi = (n: number): string => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'строка';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'строки';
  return 'строк';
};

/** «Внимание: N строк без цены — итог неполный»; N ≤ 0 (yoki noma'lum) — null (hujjatga hech narsa yozilmaydi). */
export function narxsizItogMatni(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n) || n <= 0) return null;
  const k = Math.round(n);
  return `Внимание: ${k} ${strokSozi(k)} без цены — итог неполный`;
}

/** Qatorlar ichida narxsizlar soni (mashinist mehnati sanalmaydi; narx 0 — narxli). */
export function narxsizSoni<T extends NarxQator>(qatorlar: Iterable<T>, narxOf: (q: T) => number | null | undefined): number {
  let n = 0;
  for (const q of qatorlar) if (narxBildirishnomaKerak(q, narxOf(q))) n++;
  return n;
}
