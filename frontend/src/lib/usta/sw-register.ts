/** Jonli sayt origin'i: Tauri «Onlayn qobiq» ilovalari shu sahifani yuklaydi (src-tauri/src/shell.rs). */
const SAYT_ORIGIN = 'https://smeta-tizimi.pages.dev';

/** Tauri ichida MAHALLIY qobiq (tauri.localhost / tauri:) dami: u yerda brauzer servis-workeri kerak emas.
 *  Jonli saytni yuklaydigan «Onlayn qobiq» (remote origin, `__TAURI_INTERNALS__` bor) bunga KIRMAYDI: u yerda servis-worker
 *  ilova qobig'ini oldindan keshlaydi va oflayn ochilishni ta'minlaydi (public/sw.js). */
export function tauridami(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown };
  const lokal = /^https?:\/\/tauri\.localhost$/.test(window.location.origin) || window.location.protocol === 'tauri:';
  if (lokal || !!w.__TAURI__) return true;
  return !!w.__TAURI_INTERNALS__ && window.location.origin !== SAYT_ORIGIN;
}
/** Servis-worker ro'yxatdan o'tishi mumkinmi: faqat production, brauzer qo'llaydi va Tauri ichida EMAS. */
export function swRoyxatMumkin(prod: boolean = import.meta.env.PROD): boolean {
  return prod && typeof navigator !== 'undefined' && 'serviceWorker' in navigator && !tauridami();
}

/** Servis-workerni faqat production'da va faqat oddiy brauzer/PWA da ro'yxatdan o'tkazadi (public/sw.js: faqat qobiq keshi,
 *  /api/* va supabase hech qachon keshlanmaydi). Yangi versiya chiqsa tepada «Yangilash» banneri `_shared/versiya` orqali chiqadi. Xato jim. */
export function swRoyxat(): void {
  if (!swRoyxatMumkin()) return;
  window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js').catch(() => undefined); });
}