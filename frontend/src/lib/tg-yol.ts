/**
 * tg-yol.ts — Telegram Mini App chuqur havolasi (`/tg?to=/admin/...`).
 * Bot tugmasi Mini App ni aniq sahifada ochadi. `to` FAQAT shu sayt ichidagi `/admin/...` yo'li bo'lishi mumkin
 * (ochiq yo'naltirish / javascript: / tashqi domen yo'q). Sof modul — DOM/fetch yo'q; server va klient bir xil tekshiradi.
 */
const YOL = /^\/admin(?:\/[A-Za-z0-9_\-.]+)*(?:\?[A-Za-z0-9_=&\-.%]{0,200})?$/;

/** Yaroqli ichki yo'l — o'zi; aks holda null. */
export function tgIchkiYol(to: unknown): string | null {
  if (typeof to !== 'string' || to.length > 300) return null;
  if (!YOL.test(to) || to.includes('..') || to.includes('//')) return null;
  return to;
}

/** Mini App kirish URL i: `<mini-app-url>?to=<yo'l>` (yo'l yaroqsiz bo'lsa — oddiy kirish URL i). */
export function tgChuqurHavola(miniAppUrl: string, yol: string | null | undefined): string {
  const y = tgIchkiYol(yol ?? null);
  return y ? `${miniAppUrl}?to=${encodeURIComponent(y)}` : miniAppUrl;
}
