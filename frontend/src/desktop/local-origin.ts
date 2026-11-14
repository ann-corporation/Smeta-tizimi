/** Origin of the packaged UI. Windows/Android WebViews use http://tauri.localhost; macOS/iOS WKWebView uses tauri://localhost.
 *  URL.origin is "null" for the non-special tauri: scheme, so comparisons use protocol + host. */
export const HTTP_LOCAL_ORIGIN = 'http://tauri.localhost';
export const APPLE_LOCAL_ORIGIN = 'tauri://localhost';
export function localOriginNow(): string {
  return typeof window !== 'undefined' && window.location.origin === APPLE_LOCAL_ORIGIN ? APPLE_LOCAL_ORIGIN : HTTP_LOCAL_ORIGIN;
}
export function isLocalUrl(url: URL, origin: string = localOriginNow()): boolean {
  return `${url.protocol}//${url.host}` === origin && !url.username && !url.password;
}
