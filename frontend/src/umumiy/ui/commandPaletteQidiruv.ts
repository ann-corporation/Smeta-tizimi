/** Ctrl+K qidiruvi uchun sof yordamchilar (testlanadi). */

/** Registr, apostrof turlari va ortiqcha bo'sh joysiz solishtirish matni. */
export function qidiruvMatni(s: string): string {
  return s.toLowerCase().replace(/[‘’ʻʼ'`´]/g, '').replace(/\s+/g, ' ').trim();
}

/** So'rovning HAR so'zi matnda bo'lsa — mos (tartib muhim emas: «f2 import» = «import f2»). */
export function qidiruvMos(matn: string, sorov: string): boolean {
  const m = qidiruvMatni(matn);
  return qidiruvMatni(sorov).split(' ').filter(Boolean).every((soz) => m.includes(soz));
}
