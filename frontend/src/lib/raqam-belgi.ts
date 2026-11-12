/**
 * Shartnoma/akt raqamini ekranda «№ №5» (ikki marta №) qilmaslik uchun: bazadagi raqam allaqachon «№» bilan
 * yozilgan bo‘lishi mumkin. Ekranda «№» belgisini bitta qilib qo‘yadigan joylar shu funksiyadan o‘tadi.
 */
export function raqamTozala(raqam: string | number | null | undefined): string {
  return String(raqam ?? '').trim().replace(/^(?:[№#]\s*)+/u, '').replace(/^N[°º]\s*/u, '').trim();
}

/** «actor:4» kabi xom foydalanuvchi belgisi odamga ko‘rsatilmaydi: ism bo‘lsa — ism, bo‘lmasa — null. */
export function kimMatni(kim: string | null | undefined, ism?: string | null): string | null {
  const i = (ism ?? '').trim();
  if (i) return i;
  const k = (kim ?? '').trim();
  if (!k || /^(?:actor|user|aktor)\s*[:#]?\s*\d+$/i.test(k) || /^\d+$/.test(k)) return null;
  return k;
}
