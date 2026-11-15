/**
 * lib/brend.ts — YAGONA brend nomi va «qayerdaman» belgisi (egasi 2026-11-16: QURAI rebrendi yakuni).
 *
 * Ko'rinadigan nom hamma joyda QURAI; sayt domeni qurai.uz. Ichki identifikatorlar (t2_* jadvallari, API yo'llari,
 * paket id uz.anncorp.smeta, saqlash kalitlari) O'ZGARMAYDI — bu fayl faqat foydalanuvchiga ko'rinadigan matn uchun.
 * Hujjat kolontituli, QR yozuvi, sarlavha va bosh panel belgisi shu yerdan oladi.
 */

export const BREND = 'QURAI';
export const BREND_SAYT = 'qurai.uz';
export const BREND_ORIGIN = `https://${BREND_SAYT}`;
/** Har hujjat kolontitulidagi imzo matni. */
export const BREND_HUJJAT_MATN = `${BREND} · ${BREND_SAYT} orqali tayyorlandi`;

/** Foydalanuvchi qaysi yuzada: sayt, Android ilova, Windows ilova yoki Telegram. */
export type Yuza = 'Sayt' | 'Android' | 'Windows' | 'Telegram';

type YuzaMuhit = {
  Telegram?: { WebApp?: { initData?: string; platform?: string } };
  __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown;
  location?: { origin?: string; protocol?: string };
  navigator?: { userAgent?: string };
};

/** Mavjud platforma aniqlash (Tauri qobig'i, Telegram WebApp) asosida — yangi aniqlagich yo'q. */
export function yuzaAniqla(w: YuzaMuhit | undefined = typeof window === 'undefined' ? undefined : (window as unknown as YuzaMuhit)): Yuza {
  if (!w) return 'Sayt';
  const tg = w.Telegram?.WebApp;
  if (tg && (tg.initData || (tg.platform && tg.platform !== 'unknown'))) return 'Telegram';
  const tauri = !!w.__TAURI__ || !!w.__TAURI_INTERNALS__ || /^https?:\/\/tauri\.localhost$/.test(w.location?.origin ?? '') || w.location?.protocol === 'tauri:';
  if (tauri) return /Android/i.test(w.navigator?.userAgent ?? '') ? 'Android' : 'Windows';
  return 'Sayt';
}

/** «QURAI · Sayt» yoki modul bilan «QURAI · Sayt · Pro». */
export function yuzaBelgisi(yuza: Yuza = yuzaAniqla(), modul?: string | null): string {
  const m = (modul ?? '').trim();
  return `${BREND} · ${yuza}${m ? ` · ${m}` : ''}`;
}

/** Brauzer sarlavhasi: «<sahifa> — QURAI». */
export function sahifaSarlavhasi(sahifa?: string | null): string {
  const s = (sahifa ?? '').trim();
  return s ? `${s} — ${BREND}` : BREND;
}
