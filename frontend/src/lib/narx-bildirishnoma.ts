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
