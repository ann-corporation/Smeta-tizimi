/* Egasi (2026-10-02): deploydan oldin ochilgan varaq eski kod bilan ishlab qoldi — "Forma-2 Excel" tugmasi eski,
 * Excel ochmaydigan LRV_PLUS'ni berdi (yangi versiyada bu tugma yo'q). Endi: tizim yangi versiya chiqqanini o'zi
 * sezadi (index.html dagi kirish skripti xeshi o'zgaradi) va tepada "Yangilash" banneri chiqadi; eski chunk
 * yuklanmasa (deploydan keyin o'chirilgan) — sahifa avtomatik yangilanadi. */

const KIRISH = /\/assets\/index-[A-Za-z0-9_-]+\.js/;

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

function bannerKorsat() {
  if (document.getElementById('yangi-versiya-banner')) return;
  const d = document.createElement('div');
  d.id = 'yangi-versiya-banner';
  d.setAttribute('role', 'status');
  d.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;display:flex;gap:12px;align-items:center;justify-content:center;'
    + 'padding:8px 16px;background:#1d4ed8;color:#fff;font:600 13px system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.3)';
  const m = document.createElement('span');
  m.textContent = saqlanmaganIshBormi()
    ? 'Tizimning yangi versiyasi chiqdi. Avval joriy ishingizni saqlang, keyin sahifani yangilang.'
    : 'Tizimning yangi versiyasi chiqdi — eski hujjat shakllari chiqmasligi uchun sahifani yangilang.';
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = 'Yangilash';
  b.style.cssText = 'padding:4px 14px;border-radius:6px;border:0;background:#fff;color:#1d4ed8;font-weight:700;cursor:pointer';
  b.onclick = () => location.reload();
  d.append(m, b);
  document.body.appendChild(d);
}

/* Egasi sinovi (2026-10-06): F2 import moslashtirilayotganda boshqa deploy chiqdi, eski chunk topilmadi va sahifa
 * SO'RAMASDAN qayta yuklandi — operatorning butun ishi yo'qoldi. Endi saqlanmagan ishi bor sahifa o'zini shu yerda
 * belgilaydi: unda avto-reload qilinmaydi (banner chiqadi) va sahifani yopish/yangilashda brauzer ogohlantiradi. */
const saqlanmagan = new Set<string>();
function tarkModal(e: BeforeUnloadEvent) { e.preventDefault(); e.returnValue = ''; }

/** Sahifada saqlanmagan ish bor/yo'qligini belgilaydi (masalan F2 import moslashtirish ish joyi). */
export function saqlanmaganIsh(belgi: string, bor: boolean): void {
  const oldin = saqlanmagan.size;
  if (bor) saqlanmagan.add(belgi); else saqlanmagan.delete(belgi);
  if (!oldin && saqlanmagan.size) window.addEventListener('beforeunload', tarkModal);
  if (oldin && !saqlanmagan.size) window.removeEventListener('beforeunload', tarkModal);
}
export const saqlanmaganIshBormi = (): boolean => saqlanmagan.size > 0;

export function versiyaKuzatuvi(davriyMs = 5 * 60_000): void {
  // Deploydan keyin eski lazy chunk topilmasa — Vite shu hodisani beradi: bitta marta avtomatik yangilaymiz,
  // LEKIN saqlanmagan ish bo'lsa — yo'q (faqat banner; operator ishini saqlab, o'zi yangilaydi).
  window.addEventListener('vite:preloadError', () => {
    if (saqlanmaganIshBormi()) { bannerKorsat(); return; }
    try {
      if (sessionStorage.getItem('versiya-reload') === '1') return;
      sessionStorage.setItem('versiya-reload', '1');
    } catch { /* storage yo'q — baribir yangilaymiz */ }
    location.reload();
  });
  const joriy = joriyKirishSkripti();
  if (!joriy) return; // dev rejim — kirish skripti /src/main.tsx
  try { sessionStorage.removeItem('versiya-reload'); } catch { /* */ }
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
