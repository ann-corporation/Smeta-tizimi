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
  m.textContent = 'Tizimning yangi versiyasi chiqdi — eski hujjat shakllari chiqmasligi uchun sahifani yangilang.';
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = 'Yangilash';
  b.style.cssText = 'padding:4px 14px;border-radius:6px;border:0;background:#fff;color:#1d4ed8;font-weight:700;cursor:pointer';
  b.onclick = () => location.reload();
  d.append(m, b);
  document.body.appendChild(d);
}

export function versiyaKuzatuvi(davriyMs = 5 * 60_000): void {
  // Deploydan keyin eski lazy chunk topilmasa — Vite shu hodisani beradi: bitta marta avtomatik yangilaymiz.
  window.addEventListener('vite:preloadError', () => {
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
