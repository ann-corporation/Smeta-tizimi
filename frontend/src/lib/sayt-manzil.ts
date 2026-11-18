/**
 * lib/sayt-manzil.ts — saytning KANONIK manzili va eski host(lar): domen ko'chishi (qurai.uz) uchun YAGONA manba.
 *
 * Server (Pages Functions): env `PUBLIC_ORIGIN` (masalan https://qurai.uz). Veb (Vite build): `VITE_PUBLIC_ORIGIN`.
 * Ikkalasi ham bo'lmasa — qurai.uz. Eski host (smeta-tizimi.pages.dev) o'tish davrida ISHLAYVERADI: API/webhook/yuklab olish
 * yo'llari o'sha yerda javob beradi, faqat brauzer sahifalari kanonik manzilga 301 bilan yo'naltiriladi
 * (functions/_shared/eski-host.ts). Bu fayl hech narsa import qilmaydi: veb ham, functions ham ishlatadi.
 */
export const KANONIK_ORIGIN = 'https://qurai.uz';
/** O'tish davrida ham ishlaydigan eski host(lar). Qabul ro'yxatlari (origin/WebAuthn/Google) va 301 shu ro'yxatga qaraydi. */
export const ESKI_HOSTLAR: readonly string[] = ['smeta-tizimi.pages.dev'];

const toza = (s: unknown): string | null => {
  const e = String(s ?? '').trim().replace(/\/+$/, '');
  return /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(e) ? e.toLowerCase() : null;
};

/** Server: env.PUBLIC_ORIGIN (https origin, yo'lsiz) yoki kanonik. */
export const publicOrigin = (env?: { PUBLIC_ORIGIN?: string } | null): string => toza(env?.PUBLIC_ORIGIN) ?? KANONIK_ORIGIN;

/** Veb: Vite build o'zgaruvchisi VITE_PUBLIC_ORIGIN yoki kanonik. */
export const webPublicOrigin = (): string => {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return toza(env?.VITE_PUBLIC_ORIGIN) ?? KANONIK_ORIGIN;
};

export const eskiHostmi = (host: string | null | undefined): boolean => !!host && ESKI_HOSTLAR.includes(host.toLowerCase());

/** Foydalanuvchiga beriladigan havola bazasi: so'rov ESKI hostdan kelsa — kanonik; aks holda so'rov origini (preview/localhost ishlayveradi). */
export const havolaOrigin = (env: { PUBLIC_ORIGIN?: string } | null | undefined, requestUrl: string): string => {
  const u = new URL(requestUrl);
  return eskiHostmi(u.hostname) ? publicOrigin(env) : u.origin;
};

/** Ruxsat etilgan sayt originlari: kanonik + eski host(lar) (o'tish davri). */
export const saytOriginlar = (env?: { PUBLIC_ORIGIN?: string } | null): string[] =>
  [...new Set([publicOrigin(env), ...ESKI_HOSTLAR.map((h) => `https://${h}`)])];