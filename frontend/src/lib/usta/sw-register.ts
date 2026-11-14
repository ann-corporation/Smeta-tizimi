/** Servis-workerni faqat production'da ro'yxatdan o'tkazadi (public/sw.js: faqat qobiq keshi, /api/* hech qachon). Xato jim. */
export function swRoyxat(): void {
  if (!import.meta.env.PROD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js').catch(() => undefined); });
}
