/*
 * Servis-worker (PWA: telefonda o'rnatiladigan ilova + usta «Bugun» oflayn): FAQAT ilova qobig'i (HTML + heshli /assets/* + ikonkalar) keshlanadi.
 * MOLIYAVIY ILOVA QOIDASI: /api/*, /functions/* (pul bor javoblar), supabase va har qanday boshqa-origin yoki GET-bo'lmagan so'rov
 * HECH QACHON keshlanmaydi — ular to'g'ridan-to'g'ri tarmoqqa ketadi. Kesh versiyasi o'zgarsa eskisi o'chiriladi.
 * Yangilanish: navigatsiya «tarmoq birinchi» — yangi deploy darhol ko'rinadi; yangi versiya haqida banner `_shared/versiya.ts` da.
 */
const VERSIYA = 'smeta-qobiq-v2';
const QOBIQ = '/';

self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(VERSIYA).then((c) => c.add(new Request(QOBIQ, { cache: 'reload' }))).catch(() => undefined)); });
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSIYA) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== self.location.origin) return; // supabase va boshqa tashqi manzillar — kesh YO'Q
  if (u.pathname.startsWith('/api/') || u.pathname.startsWith('/functions/') || /supabase/i.test(u.hostname)) return; // pul/tenant ma'lumoti — kesh YO'Q
  if (r.mode === 'navigate') {
    e.respondWith(fetch(r).then((res) => { if (res.ok) { const k = res.clone(); caches.open(VERSIYA).then((c) => c.put(QOBIQ, k)); } return res; })
      .catch(async () => (await caches.match(QOBIQ)) || Response.error()));
    return;
  }
  if (u.pathname.startsWith('/assets/') || u.pathname.startsWith('/ikonlar/')) {
    e.respondWith(caches.match(r).then((m) => m || fetch(r).then((res) => { if (res.ok) { const k = res.clone(); caches.open(VERSIYA).then((c) => c.put(r, k)); } return res; })));
  }
});