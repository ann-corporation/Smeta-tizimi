/** Tauri (desktop/mobil qobiq) ichidami: qobiqning o'z oflayn keshi bor, brauzer servis-workeri u yerda kerak emas. */
export function tauridami(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown };
  return !!w.__TAURI__ || !!w.__TAURI_INTERNALS__ || /^https?:\/\/tauri\.localhost$/.test(window.location.origin) || window.location.protocol === 'tauri:';
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