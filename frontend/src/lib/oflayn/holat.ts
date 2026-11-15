/** Oflayn rejimining umumiy holati (banner va sahifalar shuni kuzatadi). Hech qanday pul qiymati bu yerda saqlanmaydi. */
export type NavbatNizo = { id: string; amal: string; vaqt: number; xato: string; kod: string | null };

export type OflaynKorinish = {
  /** Native ko'prik bor va `oflayn_holat` tayyor deb javob berdi. */
  tayyor: boolean;
  /** Oxirgi o'qish tarmoqsiz, keshdan berildi. */
  oflayn: boolean;
  /** Joriy oflayn seansda keshdan berilgan ma'lumotlarning ENG ESKI vaqti (ms). */
  eskiMs: number | null;
  /** Yuborilmagan (navbatdagi) Fakt yozuvlari soni (nizolilar ham kiradi). */
  navbat: number;
  nizolar: NavbatNizo[];
  yuborilmoqda: boolean;
  /** Navbat yuborishni to'xtatgan sabab: 'sessiya' (qayta kirish kerak) yoki null. */
  toxtadi: 'sessiya' | null;
};

const BOSH: OflaynKorinish = { tayyor: false, oflayn: false, eskiMs: null, navbat: 0, nizolar: [], yuborilmoqda: false, toxtadi: null };
let joriy: OflaynKorinish = BOSH;
const tinglovchilar = new Set<() => void>();

export const oflaynKorinish = (): OflaynKorinish => joriy;
export function oflaynObuna(f: () => void): () => void {
  tinglovchilar.add(f);
  return () => { tinglovchilar.delete(f); };
}
export function oflaynYangila(qism: Partial<OflaynKorinish>): void {
  const keyingi = { ...joriy, ...qism };
  if ((Object.keys(keyingi) as (keyof OflaynKorinish)[]).every((k) => Object.is(keyingi[k], joriy[k]))) return;
  joriy = keyingi;
  tinglovchilar.forEach((f) => f());
}
/** Faqat testlar uchun. */
export function oflaynTozalaTest(): void { joriy = BOSH; tinglovchilar.clear(); }
