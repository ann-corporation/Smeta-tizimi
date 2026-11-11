/* Egasi (2026-10-02): deploydan oldin ochilgan varaq eski kod bilan ishlab qoldi — "Forma-2 Excel" tugmasi eski,
 * Excel ochmaydigan LRV_PLUS'ni berdi (yangi versiyada bu tugma yo'q). Endi: tizim yangi versiya chiqqanini o'zi
 * sezadi (index.html dagi kirish skripti xeshi o'zgaradi) va tepada "Yangilash" banneri chiqadi; eski chunk
 * yuklanmasa (deploydan keyin o'chirilgan) — sahifa avtomatik yangilanadi. */

import { t } from '../i18n/til';

const KIRISH = /\/assets\/index-[A-Za-z0-9_-]+\.js/;

/* Hodisa 2026-11-09: deploydan oldin ochilgan Fakt jurnalida ~30 qator kiritilgach «Saqlash» tarmoq xatosini berdi va
 * so'rov serverga yetmadi; kiritmalar faqat xotirada edi. Endi: yangi versiya aniqlansa (banner yoki eski chunk xatosi)
 * bu yerda belgilanadi va saqlash yo'li umumiy «internet uzildi» o'rniga aniq xabar beradi. */
let yangiVersiya = false;
/** Shu varaq ochilgandan beri yangi versiya chiqqani aniqlanganmi (banner ko'rsatilgan yoki eski chunk yuklanmagan). */
export const yangiVersiyaChiqdimi = (): boolean => yangiVersiya;

/** Lazy chunk (yoki uning CSS'i) yuklanmadi — odatda deploydan keyin eski xeshli fayl o'chirilgan. Oddiy «Failed to fetch» bu emas. */
export function chunkXatosimi(e: unknown): boolean {
  if (e && typeof e === 'object' && (e as { name?: unknown }).name === 'ChunkLoadError') return true;
  const m = e instanceof Error ? e.message : String(e ?? '');
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading (CSS )?chunk|Unable to preload CSS/i.test(m);
}

/** Yangi versiya chiqqanda saqlanmagan ish brauzerda qoralama sifatida saqlab qo'yilgan bo'lsa ko'rsatiladigan xabar. */
export const yangiVersiyaQoralamaMatni = (): string => t('Tizimning yangi versiyasi chiqdi — o‘zgarishlaringiz saqlab qo‘yildi, sahifani yangilang.');

/** Server hozir boshqa kirish skriptini beradimi (yangi deploy). Dev rejimda yoki tarmoq bo'lmasa — false. */
export async function yangiVersiyaniTekshir(): Promise<boolean> {
  if (yangiVersiya) return true;
  const joriy = joriyKirishSkripti();
  if (!joriy) return false;
  try {
    const r = await fetch('/', { cache: 'no-store' });
    const yangi = r.ok ? htmldanKirishSkripti(await r.text()) : null;
    if (yangi && yangi !== joriy) yangiVersiya = true;
  } catch { /* tarmoq yo'q — noma'lum */ }
  return yangiVersiya;
}

export function joriyKirishSkripti(): string | null {
  for (const s of Array.from(document.querySelectorAll<HTMLScriptElement>('script[type="module"][src]'))) {
    const m = KIRISH.exec(s.src);
    if (m) return m[0];
  }
  return null;
}

export function htmldanKirishSkripti(html: string): string | null {
  return KIRISH.exec(html)?.[0] ?? null;
}

/* Egasi (2026-10-25): «versiya almashganda nimalar o'zgarganini aytib turishi kerak». O'zgarishlar ro'yxati
 * public/yangiliklar.json da (har prodga chiqqan o'zgarish — egasiga tushunarli qisqa yozuv). Banner yangi versiyadagi
 * yozuvlarni ko'rsatadi; sahifa yangilangach ko'rilmagan yozuvlar bir marta «Nima yangi» oynasida chiqadi. */
export type Yangilik = { id: number; sana: string; sarlavha: string; bandlar: string[] };
const KORILGAN = 'yangilik-korilgan';

/** JSON → tekshirilgan yozuvlar (id bo'yicha kamayish tartibida). Noto'g'ri yozuvlar tashlanadi. */
export function yangiliklarniAjrat(json: unknown): Yangilik[] {
  const y = (json && typeof json === 'object' ? (json as { yozuvlar?: unknown }).yozuvlar : null);
  if (!Array.isArray(y)) return [];
  return y.filter((x): x is Yangilik => !!x && typeof x === 'object' && Number.isSafeInteger((x as Yangilik).id)
      && typeof (x as Yangilik).sarlavha === 'string' && Array.isArray((x as Yangilik).bandlar))
    .map((x) => ({ id: x.id, sana: String(x.sana ?? ''), sarlavha: x.sarlavha, bandlar: x.bandlar.filter((b) => typeof b === 'string') }))
    .sort((a, b) => b.id - a.id);
}

/** Foydalanuvchi hali ko'rmagan yozuvlar (ko'rilgan id dan katta). Ko'rilgan noma'lum bo'lsa — faqat eng yangisi. */
export function korilmaganlar(royxat: readonly Yangilik[], korilgan: number | null, eng = 6): Yangilik[] {
  if (korilgan == null) return royxat.slice(0, 1);
  return royxat.filter((x) => x.id > korilgan).slice(0, eng);
}

export async function yangiliklarOl(): Promise<Yangilik[]> {
  try { const r = await fetch('/yangiliklar.json', { cache: 'no-store' }); return r.ok ? yangiliklarniAjrat(await r.json()) : []; }
  catch { return []; }
}
export function korilganOl(): number | null {
  try { const v = localStorage.getItem(KORILGAN); return v != null && /^\d+$/.test(v) ? Number(v) : null; } catch { return null; }
}
export function korilganYoz(id: number) { try { localStorage.setItem(KORILGAN, String(id)); } catch { /* */ } }

function royxatEl(yozuvlar: readonly Yangilik[], rang: string): HTMLElement {
  const ul = document.createElement('div');
  ul.style.cssText = `margin-top:6px;max-height:50vh;overflow:auto;text-align:left;font-weight:400;color:${rang}`;
  for (const y of yozuvlar) {
    const h = document.createElement('div');
    h.textContent = `${y.sana ? y.sana + ' — ' : ''}${y.sarlavha}`;
    h.style.cssText = 'font-weight:700;margin-top:6px';
    ul.append(h);
    for (const b of y.bandlar) { const li = document.createElement('div'); li.textContent = '• ' + b; li.style.cssText = 'margin:2px 0 0 10px'; ul.append(li); }
  }
  return ul;
}

function bannerKorsat() {
  yangiVersiya = true;
  if (document.getElementById('yangi-versiya-banner')) return;
  const d = document.createElement('div');
  d.id = 'yangi-versiya-banner';
  d.setAttribute('role', 'status');
  d.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;padding:8px 16px;background:#1d4ed8;color:#fff;'
    + 'font:600 13px system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.3)';
  const qator = document.createElement('div');
  qator.style.cssText = 'display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap';
  const m = document.createElement('span');
  m.textContent = qoralamaliIshBormi()
    ? yangiVersiyaQoralamaMatni()
    : saqlanmaganIshBormi()
    ? 'Tizimning yangi versiyasi chiqdi. Avval joriy ishingizni saqlang, keyin sahifani yangilang.'
    : 'Tizimning yangi versiyasi chiqdi — eski hujjat shakllari chiqmasligi uchun sahifani yangilang.';
  const tugma = (matn: string, asosiy: boolean) => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = matn;
    b.style.cssText = `padding:4px 14px;border-radius:6px;cursor:pointer;font-weight:700;${asosiy ? 'border:0;background:#fff;color:#1d4ed8' : 'border:1px solid #fff;background:transparent;color:#fff'}`;
    return b;
  };
  const b = tugma('Yangilash', true);
  b.onclick = () => location.reload();
  const nima = tugma('Nima yangi?', false);
  nima.style.display = 'none';
  qator.append(m, nima, b);
  d.append(qator);
  document.body.appendChild(d);
  // Yangi versiyadagi o'zgarishlar ro'yxati (server allaqachon yangi yangiliklar.json beradi).
  void yangiliklarOl().then((r) => {
    const yangi = korilmaganlar(r, korilganOl());
    if (!yangi.length) return;
    m.textContent += ` Yangi: ${yangi.map((x) => x.sarlavha).join('; ')}.`;
    let ochiq: HTMLElement | null = null;
    nima.style.display = '';
    nima.onclick = () => { if (ochiq) { ochiq.remove(); ochiq = null; } else { ochiq = royxatEl(yangi, '#e0e7ff'); d.append(ochiq); } };
  });
}

/** Sahifa yangilangach: ko'rilmagan o'zgarishlar bir marta «Nima yangi» oynasida ko'rsatiladi. */
function nimaYangiOyna(): void {
  void yangiliklarOl().then((r) => {
    if (!r.length) return;
    const korilgan = korilganOl();
    const eng = r[0].id;
    if (korilgan == null) { korilganYoz(eng); return; } // birinchi kirish — eski tarixni to'kib tashlamaymiz
    /* Navigatsiya oqimi (2026-11-11): pastki-chap suzuvchi oyna kontentni yopardi. Endi ko'rilmagan yozuvlar sarlavhadagi
     * kichik «Yangi» belgisida (components/qollanma/NimaYangiBelgi) — har yangi yozuvda bir marta, tushunarli bosilguncha. */
  });
}

/* Egasi sinovi (2026-10-06): F2 import moslashtirilayotganda boshqa deploy chiqdi, eski chunk topilmadi va sahifa
 * SO'RAMASDAN qayta yuklandi — operatorning butun ishi yo'qoldi. Endi saqlanmagan ishi bor sahifa o'zini shu yerda
 * belgilaydi: unda avto-reload qilinmaydi (banner chiqadi) va sahifani yopish/yangilashda brauzer ogohlantiradi. */
const saqlanmagan = new Set<string>();
/** Saqlanmagan ishi brauzerda qoralama sifatida ham turgan belgilar (masalan Fakt jurnali). */
const qoralamali = new Set<string>();
function tarkModal(e: BeforeUnloadEvent) { e.preventDefault(); e.returnValue = ''; }

/**
 * Sahifada saqlanmagan ish bor/yo'qligini belgilaydi (masalan F2 import moslashtirish ish joyi).
 * `qoralama: true` — ish brauzerda (localStorage) ham saqlanib turadi; yangi versiya bannerida shuni aytamiz.
 * Har ikki holatda ham avto-reload YO'Q.
 */
export function saqlanmaganIsh(belgi: string, bor: boolean, opts?: { qoralama?: boolean }): void {
  const oldin = saqlanmagan.size;
  if (bor) saqlanmagan.add(belgi); else saqlanmagan.delete(belgi);
  if (bor && opts?.qoralama) qoralamali.add(belgi); else qoralamali.delete(belgi);
  if (!oldin && saqlanmagan.size) window.addEventListener('beforeunload', tarkModal);
  if (oldin && !saqlanmagan.size) window.removeEventListener('beforeunload', tarkModal);
}
export const saqlanmaganIshBormi = (): boolean => saqlanmagan.size > 0;
/** Barcha saqlanmagan ishlar brauzer qoralamasida turibdimi (bo'lmasa — umumiy «avval saqlang» matni). */
const qoralamaliIshBormi = (): boolean => saqlanmagan.size > 0 && [...saqlanmagan].every((b) => qoralamali.has(b));

/** Ilova muvaffaqiyatli chizilgach chaqiriladi: keyingi deploy'da yana bitta avto-reload ruxsat etiladi. */
export function reloadQoriqchisiniTozala(): void {
  try { sessionStorage.removeItem('versiya-reload'); } catch { /* storage yo'q */ }
}

export function versiyaKuzatuvi(davriyMs = 5 * 60_000): void {
  // Deploydan keyin eski lazy chunk topilmasa — Vite shu hodisani beradi: bitta marta avtomatik yangilaymiz,
  // LEKIN saqlanmagan ish bo'lsa — yo'q (faqat banner; operator ishini saqlab, o'zi yangilaydi).
  window.addEventListener('vite:preloadError', () => {
    yangiVersiya = true;
    if (saqlanmaganIshBormi()) { bannerKorsat(); return; }
    try {
      if (sessionStorage.getItem('versiya-reload') === '1') return;
      sessionStorage.setItem('versiya-reload', '1');
    } catch { /* storage yo'q — baribir yangilaymiz */ }
    location.reload();
  });
  // Qo'lda yozilgan import() (React.lazy emas) rad etilsa ham — yangi versiya belgisi; saqlanmagan ish bo'lsa banner.
  window.addEventListener('unhandledrejection', (e) => {
    if (!chunkXatosimi(e.reason)) return;
    yangiVersiya = true;
    if (saqlanmaganIshBormi()) bannerKorsat();
  });
  const joriy = joriyKirishSkripti();
  if (!joriy) return; // dev rejim — kirish skripti /src/main.tsx
  // `versiya-reload` qo'riqchisi bu yerda TOZALANMAYDI: App/lug'at chunki doim yiqilsa, cheksiz reload bo'lardi.
  // Uni `main.tsx` ilova haqiqatan chizilgandan keyin `reloadQoriqchisiniTozala()` bilan tozalaydi.
  nimaYangiOyna();
  let tekshirilmoqda = false;
  const tekshir = async () => {
    if (tekshirilmoqda || document.visibilityState === 'hidden') return;
    tekshirilmoqda = true;
    try {
      const r = await fetch('/', { cache: 'no-store' });
      const yangi = r.ok ? htmldanKirishSkripti(await r.text()) : null;
      if (yangi && yangi !== joriy) bannerKorsat();
    } catch { /* tarmoq yo'q — keyingi safar */ } finally { tekshirilmoqda = false; }
  };
  window.setInterval(() => void tekshir(), davriyMs);
  document.addEventListener('visibilitychange', () => void tekshir());
  window.addEventListener('focus', () => void tekshir());
}
