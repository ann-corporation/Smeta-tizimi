import type { F2Bolim } from './f2-tayyor';

/**
 * F2 tayyorlash ro'yxatini chegaralangan chizish (tezlik, egasi 2026-11-06: Sun'iy ko'l F2 da Chrome 30+ s qotdi).
 * Bir vaqtda ekranda ko'pi bilan `limit` element (ish kartasi yoki alohida material qatori); qolgani skroll bilan qo'shiladi.
 * Faqat KO'RINISH: hisob, jami, saqlash yuki butun `bolimlar` dan (bu funksiya ularga tegmaydi).
 */
export const F2_KORSAT_BOSH = 120;
export const F2_KORSAT_QADAM = 200;

export function f2KorinadiQism(bolimlar: readonly F2Bolim[], limit: number): { bolimlar: F2Bolim[]; chizildi: number; qolgan: number } {
  let qolgan = Math.max(0, limit);
  let jami = 0;
  const chiq: F2Bolim[] = [];
  for (const b of bolimlar) {
    jami += b.ishlar.length + b.alohida.length;
    if (qolgan <= 0) continue;
    const ishlar = b.ishlar.length <= qolgan ? b.ishlar : b.ishlar.slice(0, qolgan);
    qolgan -= ishlar.length;
    const alohida = b.alohida.length <= qolgan ? b.alohida : b.alohida.slice(0, qolgan);
    qolgan -= alohida.length;
    chiq.push(ishlar === b.ishlar && alohida === b.alohida ? b : { ...b, ishlar, alohida });
  }
  const chizildi = Math.max(0, limit) - qolgan;
  return { bolimlar: chiq, chizildi, qolgan: jami - chizildi };
}

/** Element (ish yoki alohida material) tartib raqami — «qatorga o'tish» faqat shu joygacha chizadi. Topilmasa — jami soni. */
export function f2ElementOrni(bolimlar: readonly F2Bolim[], id: number): number {
  let n = 0;
  for (const b of bolimlar) {
    for (const i of b.ishlar) { n++; if (i.id === id || i.resurslar.some((r) => r.id === id)) return n; }
    for (const r of b.alohida) { n++; if (r.id === id) return n; }
  }
  return n;
}
