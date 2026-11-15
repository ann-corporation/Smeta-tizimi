/**
 * Ekran klaviaturasi ochilganda fokusdagi maydonni ko'rinadigan joyga suradi.
 * Android WebView (ilova) va ba'zi mobil brauzerlar sahifani siqadi, lekin fokusdagi inputni o'zi
 * klaviatura ustiga chiqarmaydi — foydalanuvchi nima yozayotganini ko'rmaydi. Faqat teginish
 * ekranlarida ishlaydi; desktop xatti-harakati o'zgarmaydi.
 */
const MAYDON = 'input, textarea, select, [contenteditable="true"], [contenteditable=""]';

function fokusdagiMaydon(): HTMLElement | null {
  const el = document.activeElement;
  return el instanceof HTMLElement && el.matches(MAYDON) ? el : null;
}

function korinadiganJoygaSur(el: HTMLElement): void {
  const vv = window.visualViewport;
  const pastki = vv ? vv.offsetTop + vv.height : window.innerHeight;
  const r = el.getBoundingClientRect();
  if (r.top >= 0 && r.bottom <= pastki - 8) return;
  el.scrollIntoView({ block: 'center', inline: 'nearest' });
}

export function klaviaturaKorinishiniUla(win: Window = window): () => void {
  const teginish = win.matchMedia?.('(pointer: coarse)').matches ?? false;
  if (!teginish) return () => {};
  let taymer: ReturnType<typeof setTimeout> | undefined;
  const tekshir = () => {
    if (taymer) clearTimeout(taymer);
    // Klaviatura animatsiyasi va layout o'zgarishi tugashini kutamiz.
    taymer = setTimeout(() => { const el = fokusdagiMaydon(); if (el) korinadiganJoygaSur(el); }, 250);
  };
  win.addEventListener('focusin', tekshir);
  win.addEventListener('resize', tekshir);
  win.visualViewport?.addEventListener('resize', tekshir);
  return () => {
    if (taymer) clearTimeout(taymer);
    win.removeEventListener('focusin', tekshir);
    win.removeEventListener('resize', tekshir);
    win.visualViewport?.removeEventListener('resize', tekshir);
  };
}
