// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const KOD = readFileSync(join(__dirname, '..', '..', '..', 'public', 'sw.js'), 'utf8');
const ORIGIN = 'https://smeta-tizimi.pages.dev';

type Handler = (e: Record<string, unknown>) => void;
const HTML = '<html>shell</html>';

/** sw.js ni soxta SW muhitida ishga tushiradi: caches, fetch, self. */
function sw(net: (url: string, init?: RequestInit) => Promise<Response>) {
  const store = new Map<string, Map<string, Response>>();
  const path = (r: unknown) => new URL(typeof r === 'string' ? r : (r as { url: string }).url, ORIGIN).pathname;
  const kesh = (nom: string) => {
    if (!store.has(nom)) store.set(nom, new Map());
    const m = store.get(nom)!;
    return {
      put: async (r: unknown, res: Response) => { m.set(path(r), res); },
      add: async (r: unknown) => { const res = await net(ORIGIN + path(r)); if (!res.ok) throw new Error('add'); m.set(path(r), res); },
      match: async (r: unknown) => m.get(path(r))?.clone(),
      delete: async (r: unknown) => m.delete(path(r)),
      keys: async () => [...m.keys()].map((p) => ({ url: ORIGIN + p })),
    };
  };
  const caches = {
    open: async (n: string) => kesh(n),
    keys: async () => [...store.keys()],
    delete: async (n: string) => store.delete(n),
    match: async (r: unknown) => { for (const m of store.values()) { const x = m.get(path(r)); if (x) return x.clone(); } return undefined; },
  };
  const handlers: Record<string, Handler> = {};
  const self = { location: { origin: ORIGIN }, addEventListener: (t: string, f: Handler) => { handlers[t] = f; }, skipWaiting: vi.fn(), clients: { claim: vi.fn(async () => undefined) } };
  const fetchSoxta = vi.fn((r: unknown, init?: RequestInit) => net(typeof r === 'string' ? ORIGIN + path(r) : (r as { url: string }).url, init));
  new Function('self', 'caches', 'fetch', 'Response', 'Request', 'URL', 'setTimeout', KOD)(self, caches, fetchSoxta, Response, class { url: string; constructor(u: string) { this.url = new URL(u, ORIGIN).href; } }, URL, setTimeout);
  const waits: Promise<unknown>[] = [];
  const hodisa = (extra: Record<string, unknown>) => {
    const e: Record<string, unknown> = { waitUntil: (p: Promise<unknown>) => waits.push(p), respondWith: vi.fn(), ...extra };
    return e;
  };
  return {
    store, caches, handlers, fetchSoxta, waits,
    async install() { const e = hodisa({}); handlers.install(e); await Promise.all(waits); },
    async activate() { const e = hodisa({}); handlers.activate(e); await Promise.all(waits); },
    async fetchEvent(url: string, o: { method?: string; mode?: string } = {}) {
      const e = hodisa({ request: { method: o.method ?? 'GET', url, mode: o.mode ?? 'cors' } });
      handlers.fetch(e);
      const rw = e.respondWith as ReturnType<typeof vi.fn>;
      return { handled: rw.mock.calls.length > 0, res: rw.mock.calls.length ? await (rw.mock.calls[0][0] as Promise<Response>) : null };
    },
    async xabar(data: unknown) {
      const javoblar: unknown[] = [];
      const e = hodisa({ data, ports: [{ postMessage: (m: unknown) => javoblar.push(m) }] });
      handlers.message(e);
      await Promise.all(waits);
      return javoblar;
    },
  };
}

const ok = (b: string, status = 200) => new Response(b, { status });
const MANIFEST = { versiya: 'abc123', fayllar: ['/', '/assets/app-1.js', '/assets/chunk-2.js', '/assets/app-1.css'] };
function tarmoq(opts: { manifest?: unknown; yiq?: string[]; oflayn?: () => boolean } = {}) {
  return async (url: string): Promise<Response> => {
    if (opts.oflayn?.()) throw new TypeError('Failed to fetch');
    const p = new URL(url).pathname;
    if (p === '/sw-manifest.json') return ok(JSON.stringify(opts.manifest ?? MANIFEST));
    if (opts.yiq?.includes(p)) return ok('x', 500);
    return ok(p === '/' || !p.startsWith('/assets') ? HTML : 'js:' + p);
  };
}

describe('public/sw.js: navigatsiya oflayn zaxirasi va oldindan keshlash', () => {
  it('navigatsiya tarmoq birinchi; tarmoq yo\'q bo\'lsa keshdagi qobiq (har qanday yo\'l uchun "/")', async () => {
    let off = false;
    const s = sw(tarmoq({ oflayn: () => off }));
    await s.install();
    const onlayn = await s.fetchEvent(ORIGIN + '/obyekt/5', { mode: 'navigate' });
    expect(onlayn.handled).toBe(true);
    expect(await onlayn.res!.text()).toBe(HTML);
    off = true;
    const oflayn = await s.fetchEvent(ORIGIN + '/obyekt/5/fakt', { mode: 'navigate' });
    expect(await oflayn.res!.text()).toBe(HTML);
  });

  it('tarmoq osilib qolsa (8 s) keshdagi qobiq ochiladi', async () => {
    vi.useFakeTimers();
    try {
      let osil = false;
      const s = sw(async (url) => (osil ? new Promise<Response>(() => undefined) : tarmoq()(url)));
      await s.install();
      osil = true;
      const p = s.fetchEvent(ORIGIN + '/', { mode: 'navigate' });
      await vi.advanceTimersByTimeAsync(8100);
      expect(await (await p).res!.text()).toBe(HTML);
    } finally { vi.useRealTimers(); }
  });

  it('keshlanmagan va tarmoq yo\'q: xato javob (hech narsa to\'qilmaydi)', async () => {
    const s = sw(tarmoq({ oflayn: () => true }));
    const r = await s.fetchEvent(ORIGIN + '/', { mode: 'navigate' });
    expect(r.res!.type === 'error' || r.res!.status === 0).toBe(true);
  });

  it('/api/*, /functions/*, supabase, boshqa origin, GET bo\'lmagan so\'rovlar HECH QACHON ushlanmaydi', async () => {
    const s = sw(tarmoq());
    for (const [u, m] of [
      [ORIGIN + '/api/sb', 'GET'], [ORIGIN + '/api/obyekt-paket?obyekt_id=1', 'GET'], [ORIGIN + '/api/sessiya', 'GET'],
      [ORIGIN + '/functions/x', 'GET'], ['https://abc.supabase.co/rest/v1/x', 'GET'], ['https://evil.example/assets/a.js', 'GET'],
      [ORIGIN + '/assets/a.js', 'POST'], [ORIGIN + '/api/sb-yoz', 'POST'],
    ] as const) {
      expect((await s.fetchEvent(u, { method: m })).handled, `${m} ${u}`).toBe(false);
    }
    // Pul bor javoblar bironta keshda ham yo'q.
    expect([...s.store.values()].flatMap((m) => [...m.keys()]).filter((k) => k.startsWith('/api'))).toEqual([]);
  });

  it('/assets/* birinchi marta tarmoqdan, keyin keshdan (oflayn)', async () => {
    let off = false;
    const s = sw(tarmoq({ oflayn: () => off }));
    const a = await s.fetchEvent(ORIGIN + '/assets/app-9.js');
    expect(await a.res!.text()).toBe('js:/assets/app-9.js');
    await new Promise((r) => setTimeout(r, 0));
    off = true;
    const b = await s.fetchEvent(ORIGIN + '/assets/app-9.js');
    expect(await b.res!.text()).toBe('js:/assets/app-9.js');
  });

  it('OFLAYN_PRECACHE: manifestdagi hamma fayl keshlanadi, belgi yoziladi, versiya qaytadi, eski assetlar o\'chadi', async () => {
    const s = sw(tarmoq());
    await s.install();
    const kesh = await s.caches.open('smeta-qobiq-v3');
    await kesh.put('/assets/eski-0.js', ok('old'));
    const javob = await s.xabar({ type: 'OFLAYN_PRECACHE' });
    expect(javob).toEqual([{ ok: true, versiya: 'abc123' }]);
    const kalitlar = (await kesh.keys()).map((k: { url: string }) => new URL(k.url).pathname).sort();
    expect(kalitlar).toEqual(['/', '/assets/app-1.css', '/assets/app-1.js', '/assets/chunk-2.js']);
    expect(await (await s.caches.open('smeta-qobiq-meta')).match('/__oflayn_qobiq__')).toBeTruthy();
  });

  it('precache xatosida (fayl 500) ok:false va belgi qo\'yilmaydi', async () => {
    const s = sw(tarmoq({ yiq: ['/assets/chunk-2.js'] }));
    await s.install();
    const [j] = (await s.xabar({ type: 'OFLAYN_PRECACHE' })) as { ok: boolean }[];
    expect(j.ok).toBe(false);
    expect(await (await s.caches.open('smeta-qobiq-meta')).match('/__oflayn_qobiq__')).toBeUndefined();
  });

  it('boshqa xabarlar e\'tiborsiz; manifest buzuq bo\'lsa ok:false', async () => {
    const s = sw(tarmoq({ manifest: { versiya: 1 } }));
    expect(await s.xabar({ type: 'X' })).toEqual([]);
    const [j] = (await s.xabar({ type: 'OFLAYN_PRECACHE' })) as { ok: boolean }[];
    expect(j.ok).toBe(false);
  });

  it('belgi bor bo\'lsa yangi versiya o\'rnatilganda avtomatik oldindan keshlanadi; belgisiz — faqat "/"', async () => {
    const s1 = sw(tarmoq());
    await s1.install();
    expect(s1.fetchSoxta.mock.calls.some((c) => String(c[0]).includes('sw-manifest'))).toBe(false);
    const s2 = sw(tarmoq());
    await (await s2.caches.open('smeta-qobiq-meta')).put('/__oflayn_qobiq__', ok('abc'));
    await s2.install();
    const kesh = await s2.caches.open('smeta-qobiq-v3');
    expect((await kesh.keys()).length).toBe(4);
  });

  it('activate eski kesh versiyalarini o\'chiradi, meta belgisini saqlaydi', async () => {
    const s = sw(tarmoq());
    await (await s.caches.open('smeta-qobiq-v2')).put('/', ok('eski'));
    await (await s.caches.open('smeta-qobiq-meta')).put('/__oflayn_qobiq__', ok('a'));
    await s.activate();
    expect(await s.caches.keys()).toContain('smeta-qobiq-meta');
    expect(await s.caches.keys()).not.toContain('smeta-qobiq-v2');
  });
});
