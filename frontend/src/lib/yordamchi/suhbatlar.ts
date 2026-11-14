/**
 * Jarvis suhbatlari ro'yxati (brauzerda, foydalanuvchi + kompaniya bo'yicha): «Yangi suhbat» bosilganda joriy suhbat ixcham ko'rinishda
 * arxivlanadi (sarlavha + oxirgi xabarlar, har biri qisqartirilgan) va qayta davom ettiriladi. Xom matn 30 kundan keyin o'chadi, ro'yxat ≤ 20 ta,
 * hajm ≤ ~60 KB — shuning uchun baza (≈466/500 MB) ga yuk tushmaydi. Server tomonidagi saqlash (qurilmalar orasida) — alohida bosqich.
 */
export type ArxivXabar = { rol: 'user' | 'ai'; matn: string };
export type Suhbat = { id: string; sarlavha: string; yangilandi: number; xabarlar: ArxivXabar[] };

export const SAQLASH_KUN = 30; export const MAX_SUHBAT = 20; export const MAX_XABAR = 12; export const MAX_MATN = 400; const MAX_BAYT = 60_000;
const KUN = 86_400_000;
const qisqa = (s: string, n: number) => { const x = s.replace(/\s+/g, ' ').trim(); return x.length > n ? x.slice(0, n - 1) + '…' : x; };

export const suhbatKaliti = (uid: number | null | undefined, kid: number | null | undefined) => `jarvis-suhbatlar:${uid ?? 0}:${kid ?? 0}`;

/** Muddati o'tganlarni olib tashlaydi, eng yangisi birinchi. */
export function suhbatTozala(royxat: readonly Suhbat[], hozir = Date.now()): Suhbat[] {
  return royxat.filter((s) => hozir - s.yangilandi <= SAQLASH_KUN * KUN).sort((a, b) => b.yangilandi - a.yangilandi).slice(0, MAX_SUHBAT);
}

/** Joriy suhbatni ro'yxatga qo'shadi (≥1 foydalanuvchi xabari bo'lsa); bir xil `id` yangilanadi. Hajm chegarasidan oshsa eng eskilar tashlanadi. */
export function suhbatArxivla(royxat: readonly Suhbat[], id: string, xabarlar: ReadonlyArray<{ rol: 'user' | 'ai'; matn: string; jonli?: boolean }>, hozir = Date.now()): Suhbat[] {
  const toza = xabarlar.filter((x) => x.matn && !x.jonli);
  const birinchi = toza.find((x) => x.rol === 'user');
  if (!birinchi) return suhbatTozala(royxat, hozir);
  const yangi: Suhbat = { id, sarlavha: qisqa(birinchi.matn, 60), yangilandi: hozir, xabarlar: toza.slice(-MAX_XABAR).map((x) => ({ rol: x.rol, matn: qisqa(x.matn, MAX_MATN) })) };
  let list = suhbatTozala([yangi, ...royxat.filter((s) => s.id !== id)], hozir);
  while (list.length > 1 && JSON.stringify(list).length > MAX_BAYT) list = list.slice(0, -1);
  return list;
}

export function suhbatOqi(kalit: string, st: Pick<Storage, 'getItem'> | null = typeof localStorage === 'undefined' ? null : localStorage, hozir = Date.now()): Suhbat[] {
  try {
    const v = JSON.parse(st?.getItem(kalit) ?? '[]');
    return Array.isArray(v) ? suhbatTozala(v.filter((s): s is Suhbat => s && typeof s.id === 'string' && Array.isArray(s.xabarlar) && typeof s.yangilandi === 'number'), hozir) : [];
  } catch { return []; }
}
export function suhbatYoz(kalit: string, royxat: readonly Suhbat[], st: Pick<Storage, 'setItem'> | null = typeof localStorage === 'undefined' ? null : localStorage) {
  try { st?.setItem(kalit, JSON.stringify(royxat)); } catch { /* xotira yopiq */ }
}
