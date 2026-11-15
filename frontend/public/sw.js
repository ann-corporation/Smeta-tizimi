/*
 * Servis-worker (PWA + Tauri "Onlayn qobiq" oflayn ochilishi): FAQAT ilova qobig'i (HTML + heshli /assets/* + ikonkalar) keshlanadi.
 * MOLIYAVIY ILOVA QOIDASI: /api/*, /functions/* (pul bor javoblar), supabase va har qanday boshqa-origin yoki GET-bo'lmagan so'rov
 * HECH QACHON bu yerda keshlanmaydi - ular to'g'ridan-to'g'ri tarmoqqa ketadi. (Native ilovada pul ma'lumotini faqat shifrlangan
 * native kesh saqlaydi: src/lib/oflayn.) Kesh versiyasi o'zgarsa eskisi o'chiriladi.
 * Navigatsiya "tarmoq birinchi": yangi deploy darhol ko'rinadi; tarmoq yo'q yoki 8 s ichida javob bermasa keshdagi qobiq ochiladi
 * (SPA: har qanday yo'l uchun "/"). Yangi versiya haqida banner `_shared/versiya.ts` da.
 *
 * OFLAYN QOBIQ: native ilova sahifasi {type:'OFLAYN_PRECACHE'} xabarini yuboradi -> /sw-manifest.json dagi (build paytida yasaladi)
 * barcha heshli fayllar keshlanadi va belgi qo'yiladi; keyingi versiyalarda o'rnatish paytida ham shu avtomatik takrorlanadi.
 * Oddiy brauzer foydalanuvchisi bu xabarni yubormaydi - ular uchun faqat ko'rilgan fayllar keshlanadi (avvalgidek).
 */
const VERSIYA = 'smeta-qobiq-v3';
const META = 'smeta-qobiq-meta';
const BELGI = '/__oflayn_qobiq__';
const QOBIQ = '/';
const MANIFEST = '/sw-manifest.json';
const NAV_TAYMER_MS = 8000;

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil((async () => {
    const c = await caches.open(VERSIYA);
    await c.add(new Request(QOBIQ, { cache: 'reload' })).catch(() => undefined);
    // Oldin native ilovada oflayn qobiq yoqilgan bo'lsa, yangi versiya ham to'liq oldindan keshlanadi.
    if (await belgiBormi()) await oldindanKeshla().catch(() => undefined);
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSIYA && k !== META) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function belgiBormi() {
  try { return !!(await (await caches.open(META)).match(BELGI)); } catch { return false; }
}

/** /sw-manifest.json dagi hamma faylni keshlaydi; manifestda yo'q eski /assets/ yozuvlari o'chiriladi. */
async function oldindanKeshla() {
  const res = await fetch(MANIFEST, { cache: 'reload' });
  if (!res.ok) throw new Error('MANIFEST_' + res.status);
  const m = await res.json();
  const fayllar = Array.isArray(m.fayllar) ? m.fayllar.filter((f) => typeof f === 'string' && f.startsWith('/')) : [];
  if (!fayllar.length || typeof m.versiya !== 'string') throw new Error('MANIFEST_BUZUQ');
  const c = await caches.open(VERSIYA);
  const navbat = fayllar.slice();
  const ishchi = async () => {
    for (let f = navbat.pop(); f; f = navbat.pop()) {
      if (await c.match(f)) continue;
      const r = await fetch(f);
      if (!r.ok) throw new Error('FAYL_' + r.status + ' ' + f);
      await c.put(f, r);
    }
  };
  await Promise.all([ishchi(), ishchi(), ishchi(), ishchi()]);
  const kerak = new Set(fayllar);
  for (const so of await c.keys()) {
    const p = new URL(so.url).pathname;
    if (p.startsWith('/assets/') && !kerak.has(p)) await c.delete(so);
  }
  await (await caches.open(META)).put(BELGI, new Response(m.versiya));
  return m.versiya;
}

self.addEventListener('message', (e) => {
  if (!e.data || e.data.type !== 'OFLAYN_PRECACHE') return;
  const port = e.ports && e.ports[0];
  e.waitUntil(oldindanKeshla().then(
    (versiya) => port && port.postMessage({ ok: true, versiya }),
    (err) => port && port.postMessage({ ok: false, xato: String(err && err.message || err) }),
  ));
});

self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== self.location.origin) return; // supabase va boshqa tashqi manzillar - kesh YO'Q
  if (u.pathname.startsWith('/api/') || u.pathname.startsWith('/functions/') || /supabase/i.test(u.hostname)) return; // pul/tenant ma'lumoti - kesh YO'Q
  if (r.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const res = await Promise.race([
          fetch(r),
          new Promise((_, yoq) => setTimeout(() => yoq(new Error('NAV_TIMEOUT')), NAV_TAYMER_MS)),
        ]);
        if (res.ok) { const k = res.clone(); caches.open(VERSIYA).then((c) => c.put(QOBIQ, k)); }
        return res;
      } catch {
        return (await caches.match(QOBIQ)) || Response.error();
      }
    })());
    return;
  }
  if (u.pathname.startsWith('/assets/') || u.pathname.startsWith('/ikonlar/')) {
    e.respondWith(caches.match(r).then((m) => m || fetch(r).then((res) => { if (res.ok) { const k = res.clone(); caches.open(VERSIYA).then((c) => c.put(r, k)); } return res; })));
  }
});
