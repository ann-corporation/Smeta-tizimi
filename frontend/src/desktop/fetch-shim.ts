export const DESKTOP_API_ORIGIN = 'https://smeta-tizimi.pages.dev';
export type NativeInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
export type NativeHttpResponse = { status: number; body: string; etag: string | null };

/** Tauri global core API. No renderer command returns a Bearer credential. */
export function nativeInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const bridge = (window as unknown as { __TAURI__?: { core?: { invoke?: NativeInvoke } } }).__TAURI__?.core?.invoke;
  if (!bridge || window.location.origin !== 'http://tauri.localhost') return Promise.reject(new Error('DESKTOP_NATIVE_REQUIRED'));
  return bridge<T>(command, args);
}

/** Only local /api calls go through Rust, which supplies credential/Origin and refuses redirects. */
export function desktopFetch(original: typeof fetch, invoke: NativeInvoke, localOrigin = 'http://tauri.localhost', offline?: Parameters<typeof desktopPageFetch>[2]): typeof fetch {
  const transport: typeof fetch = async (input, init) => {
    const raw = input instanceof Request ? input.url : String(input);
    const url = new URL(raw, localOrigin);
    if (url.origin !== localOrigin || !url.pathname.startsWith('/api/')) return original(input, init);
    const request = new Request(url.href, input instanceof Request ? input : undefined);
    const combined = new Request(request, init);
    if (combined.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (!['GET', 'POST'].includes(combined.method)) throw new Error('DESKTOP_METHOD_DENIED');
    if (url.pathname === '/api/chiqish') {
      if (combined.method !== 'POST' || url.search) throw new Error('DESKTOP_METHOD_DENIED');
      await invoke<void>('desktop_session_clear');
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('desktop-session-ended'));
      return Response.json({ ok: true });
    }
    const result = await invoke<NativeHttpResponse>('desktop_request', {
      path: url.pathname + url.search, method: combined.method,
      body: combined.method === 'GET' ? null : await combined.text(),
      etag: combined.headers.get('If-None-Match'),
    });
    if (combined.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const headers = new Headers({ 'Content-Type': 'application/json' });
    if (result.etag) headers.set('ETag', result.etag);
    return new Response([204, 205, 304].includes(result.status) ? null : result.body, { status: result.status, headers });
  };
  return offline ? desktopPageFetch(transport, invoke, offline) : transport;
}
import { desktopPageFetch } from './page-cache';
