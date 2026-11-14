/**
 * F2 import: fayl NOMIDAN obyekt, F2 raqami va oyni taklif qilish (sof). Faqat TAKLIF — foydalanuvchi o'zgartiradi;
 * aniq bitta mos kelmasa hech narsa taxmin qilinmaydi.
 */
const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[^a-zа-яўқғҳ0-9]+/g, ' ').trim();

/** «F2 №36», «Ф-2 № 36», «акт 36», «akt_36» → "36"; topilmasa null. */
export function f2RaqamFayldan(fayl: string): string | null {
  const m = /(?:ф\s*-?\s*2|f\s*-?\s*2|акт|akt)[\s_\-.]*(?:№|n|no|nomer|номер)?[\s_\-.]*(\d{1,5})(?!\d)/i.exec(fayl);
  return m ? String(Number(m[1])) : null;
}

/** Fayl nomida «YYYY-MM» / «MM.YYYY» / «MM_YYYY» ko'rinishidagi oy → «YYYY-MM»; aniq bitta bo'lmasa null. */
export function f2OyFayldan(fayl: string): string | null {
  const topilgan = new Set<string>();
  for (const m of fayl.matchAll(/(20\d{2})[-._](0[1-9]|1[0-2])(?!\d)/g)) topilgan.add(`${m[1]}-${m[2]}`);
  for (const m of fayl.matchAll(/(?<!\d)(0[1-9]|1[0-2])[-._](20\d{2})(?!\d)/g)) topilgan.add(`${m[2]}-${m[1]}`);
  return topilgan.size === 1 ? [...topilgan][0] : null;
}

/** Fayl nomida nomi to'liq uchraydigan AYNAN BITTA obyekt (eng uzun mos nom ustun; teng uzunlikda bir nechta — null). */
export function f2ObyektFayldan(fayl: string, obyektlar: ReadonlyArray<{ id: number; nom: string }>): number | null {
  const f = ` ${norm(fayl)} `;
  const mos = obyektlar.map((o) => ({ id: o.id, n: norm(o.nom) })).filter((o) => o.n.length >= 4 && f.includes(` ${o.n} `));
  if (!mos.length) return null;
  const eng = Math.max(...mos.map((o) => o.n.length));
  const top = mos.filter((o) => o.n.length === eng);
  return top.length === 1 ? top[0].id : null;
}
