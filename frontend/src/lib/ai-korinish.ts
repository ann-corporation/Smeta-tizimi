/**
 * AI KO'RINISHI — sof yordamchilar (egasi 2026-10-25: «AI javobi va harakati aniq karta bo'lib o'qilsin, token sarfi so'z bilan»).
 * Hech qanday prompt/oqim/asbob mantig'i yo'q — faqat ko'rsatish uchun matn kalitlari va muhr (fz-stamp) variantlari.
 */

/** Token soni → so'z bilan: kalit (t() orqali) va {n}. 0 yoki noma'lum — «token sarflanmadi» / «—». */
export function tokenMatn(n: number | null | undefined): { kalit: string; n: string } {
  if (n == null || !Number.isFinite(n)) return { kalit: 'token noma’lum', n: '' };
  const v = Math.max(0, Math.round(n));
  if (v === 0) return { kalit: 'token sarflanmadi', n: '' };
  const f = (x: number) => x.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
  if (v >= 1_000_000) return { kalit: '{n} mln token', n: f(v / 1_000_000) };
  if (v >= 1_000) return { kalit: '{n} ming token', n: f(v / 1_000) };
  return { kalit: '{n} token', n: String(v) };
}

/** Javob vaqti (ms) → «1,2 soniya»; noma'lum — null. */
export function soniyaMatn(ms: number | null | undefined): string | null {
  return ms == null || !Number.isFinite(ms) ? null : (ms / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 });
}

/** AI harakati holati → muhr (so'z + rang). */
export type HarakatHolat = 'kutilmoqda' | 'bajarilmoqda' | 'bajarildi' | 'xato' | 'rad' | 'tasdiqlandi';
export const HARAKAT_MUHR: Record<HarakatHolat, { matn: string; cls: string }> = {
  kutilmoqda: { matn: 'Tasdiq kutmoqda', cls: 'fz-stamp--warn' },
  bajarilmoqda: { matn: 'Bajarilmoqda', cls: 'fz-stamp--info' },
  tasdiqlandi: { matn: 'Tasdiqlandi', cls: 'fz-stamp--info' },
  bajarildi: { matn: 'Bajarildi', cls: 'fz-stamp--ok' },
  xato: { matn: 'Xato', cls: 'fz-stamp--danger' },
  rad: { matn: 'Rad etildi', cls: 'fz-stamp--draft' },
};
export const harakatMuhr = (h: string) => HARAKAT_MUHR[h as HarakatHolat] ?? { matn: h, cls: '' };

/** Xavf darajasi → muhr. */
export const XAVF_MUHR: Record<string, string> = { past: 'fz-stamp--ok', orta: 'fz-stamp--warn', yuqori: 'fz-stamp--danger' };

/** Limitga nisbatan sarf: ulush (0..1, chizish uchun cheklangan) va daraja. Limit yo'q — «yoq» (AI ishlamaydi). */
export function limitHolati(sarf: number | null | undefined, limit: number | null | undefined, ogohFoiz = 80): { ulush: number; foiz: number | null; daraja: 'yoq' | 'ok' | 'ogoh' | 'tugadi' } {
  if (limit == null || !Number.isFinite(limit) || limit <= 0) return { ulush: 0, foiz: null, daraja: 'yoq' };
  const s = Math.max(0, Number(sarf ?? 0));
  const foiz = (s / limit) * 100;
  return { ulush: Math.min(1, s / limit), foiz, daraja: foiz >= 100 ? 'tugadi' : foiz >= ogohFoiz ? 'ogoh' : 'ok' };
}
