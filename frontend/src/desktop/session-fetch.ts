/** A successful native login replaces the identity. Old cache callbacks must not invalidate its successor. */
export function desktopSessionFetch(create: (events: { status: (offline: boolean) => void; invalidate: () => void }) => typeof fetch,
  events: { status: (offline: boolean) => void; invalidate: () => void; ended: () => void }): typeof fetch {
  let epoch = 0;
  const bind = () => {
    const own = ++epoch;
    return create({ status: value => { if (own === epoch) events.status(value); }, invalidate: () => { if (own === epoch) events.invalidate(); } });
  };
  let current = bind();
  return async (input, init) => {
    const request = current, response = await request(input, init);
    if (request !== current) throw new Error('DESKTOP_SESSION_CHANGED'); // Never deliver a retired identity's body.
    const url = new URL(input instanceof Request ? input.url : String(input), 'http://tauri.localhost');
    if (response.ok && url.origin === 'http://tauri.localhost' && url.pathname === '/api/kirish') current = bind();
    else if (response.status === 401) events.ended();
    return response;
  };
}
/** Tauri's IPC uses window.fetch too. Only application requests may trigger native work. */
export function desktopEntryFetch(original: typeof fetch, pages: typeof fetch, origin: string,
  remember: () => Promise<void>): typeof fetch {
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), origin);
    if (url.origin !== origin || !url.pathname.startsWith('/api/')) return original(input, init);
    const response = await pages(input, init);
    if (response.ok) await remember();
    return response;
  };
}
