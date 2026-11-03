/** Lokal Tauri frontendning /api/ so'rovlarini faqat bitta BFF originiga yuborish. */
export const DESKTOP_API_ORIGIN = 'https://smeta-tizimi.pages.dev';
export type DesktopSession = { token: () => Promise<string | null> };

/** O'z-o'zidan global fetchni almashtirmaydi; desktop bootstrap o'rnatadi. */
export function desktopFetch(
  original: typeof fetch, session: DesktopSession, localOrigin = 'http://tauri.localhost',
): typeof fetch {
  return async (input, init) => {
    const raw = input instanceof Request ? input.url : String(input);
    const url = new URL(raw, localOrigin);
    if (url.origin !== localOrigin || !url.pathname.startsWith('/api/')) return original(input, init);
    const destination = new URL(url.pathname + url.search, DESKTOP_API_ORIGIN);
    const request = new Request(new URL(url.pathname + url.search, localOrigin), input instanceof Request ? input : undefined);
    const combined = new Request(request, init);
    const token = await session.token();
    const headers = new Headers(combined.headers);
    // Brauzer cookie yoki caller bergan token bu transportdan o'tmaydi.
    headers.delete('cookie'); headers.delete('authorization');
    if (token) {
      if (/[\r\n]/.test(token)) throw new Error('DESKTOP_TOKEN_INVALID');
      headers.set('authorization', `Bearer ${token}`);
    }
    // Redirect'da tokenni boshqa hostga olib ketish ehtimoli yopiladi.
    const body = combined.method === 'GET' || combined.method === 'HEAD' ? undefined : await combined.arrayBuffer();
    return original(destination.href, {
      method: combined.method, headers, body, signal: combined.signal,
      credentials: 'omit', redirect: 'error', cache: combined.cache,
    });
  };
}
