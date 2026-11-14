/**
 * Kirishdagi NIYAT («qaytish»): kirmagan foydalanuvchi amal tugmasini bosganda (`<Link to="/" state={{ qaytish }}>`)
 * borishni xohlagan ichki manzil. Kirish (parol, email kod, Google, Telegram) muvaffaqiyatli bo'lgach shu manzilga qaytariladi.
 *
 * Xavfsizlik: faqat ICHKI nisbiy yo'l qabul qilinadi — `/` bilan boshlanadi, `//` yoki `/\` emas (protokolsiz tashqi manzil),
 * boshqaruv belgisi yo'q. Boshqa har qanday qiymat — null (ochiq yo'naltirish bo'lmaydi).
 * sessionStorage — sahifa qayta yuklansa yoki kirish tashqi oynadan qaytsa ham niyat saqlansin; xotira yopiq bo'lsa jim o'tadi.
 */
export const QAYTISH_KALIT = 't2_kirish_qaytish';
/** Saqlangan niyat shu vaqtdan keyin eskirgan sanaladi (unutilgan eski niyat keyingi kirishni boshqa joyga olib ketmasin). */
export const QAYTISH_MUDDAT_MS = 30 * 60_000;
const MAX_UZUNLIK = 512;

/** Ichki nisbiy yo'lmi: ha — o'sha yo'l, yo'q — null. */
export function xavfsizQaytish(v: unknown): string | null {
  if (typeof v !== 'string' || v.length < 2 || v.length > MAX_UZUNLIK) return null;
  if (v[0] !== '/' || v[1] === '/' || v[1] === '\\') return null;
  // Boshqaruv belgilari (brauzer URL dan tashlab yuboradi: «/\t/evil» → «//evil») va teskari chiziq — rad.
  for (let i = 0; i < v.length; i++) { const c = v.charCodeAt(i); if (c < 0x20 || c === 0x7f || c === 0x5c) return null; }
  return v;
}

/** `location.state` dan niyat (`{ qaytish: '/admin/…' }`). */
export function holatdanQaytish(state: unknown): string | null {
  if (!state || typeof state !== 'object') return null;
  return xavfsizQaytish((state as { qaytish?: unknown }).qaytish);
}

export function qaytishSaqla(yol: unknown, hozir: number = Date.now()): void {
  const y = xavfsizQaytish(yol);
  if (!y) return;
  try { sessionStorage.setItem(QAYTISH_KALIT, JSON.stringify({ yol: y, vaqt: hozir })); } catch { /* xotira yopiq */ }
}

/** Saqlangan (eskirmagan) niyat; o'chirmaydi. */
export function kutilayotganQaytish(hozir: number = Date.now()): string | null {
  try {
    const xom = sessionStorage.getItem(QAYTISH_KALIT);
    if (!xom) return null;
    const j = JSON.parse(xom) as { yol?: unknown; vaqt?: unknown };
    if (typeof j.vaqt !== 'number' || hozir - j.vaqt > QAYTISH_MUDDAT_MS || hozir < j.vaqt) { qaytishTozalash(); return null; }
    return xavfsizQaytish(j.yol);
  } catch { return null; }
}

export function qaytishTozalash(): void {
  try { sessionStorage.removeItem(QAYTISH_KALIT); } catch { /* xotira yopiq */ }
}

/** Niyatni oladi va o'chiradi (bir marta ishlatiladi). */
export function qaytishOlibTozalash(hozir: number = Date.now()): string | null {
  const y = kutilayotganQaytish(hozir);
  qaytishTozalash();
  return y;
}
