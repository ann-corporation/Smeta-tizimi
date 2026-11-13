/**
 * moslash-sozlama.ts — varaq belgisi regexi (smeta BO'LIM nomidan) sozlamasi. Kompaniyalarda nomlash farq qiladi («(КР-5)», «[лист КР/5]», «КР 5»).
 * Hozir shu BRAUZERDA saqlanadi (kompaniya bo'yicha); server darajasida saqlash — keyingi qadam. Yaroqsiz regex rad etiladi, standartga qaytish mumkin.
 */
import { MOSLASH_STANDART, nomdanBelgilar } from './moslash';

const KALIT = (kompaniyaId: number) => `loyiha-smeta:belgi-regex:${kompaniyaId}`;

export type RegexTekshiruv = { ok: true; belgilar: string[] } | { ok: false; sabab: 'bosh' | 'yaroqsiz' | 'guruhsiz' };

/** Regex yaroqlimi va namuna matndan qaysi belgilarni oladi (1-guruh = belgi). */
export function regexTekshir(manba: string, namuna: string): RegexTekshiruv {
  if (!manba.trim()) return { ok: false, sabab: 'bosh' };
  try { new RegExp(manba, 'gi'); } catch { return { ok: false, sabab: 'yaroqsiz' }; }
  if (!/\((?!\?)/.test(manba)) return { ok: false, sabab: 'guruhsiz' };
  return { ok: true, belgilar: [...nomdanBelgilar(namuna, manba)] };
}

export function regexOqi(kompaniyaId: number): string {
  try { return localStorage.getItem(KALIT(kompaniyaId)) || MOSLASH_STANDART.belgiRegex; } catch { return MOSLASH_STANDART.belgiRegex; }
}
export function regexSaqla(kompaniyaId: number, manba: string | null): void {
  try { if (!manba || manba === MOSLASH_STANDART.belgiRegex) localStorage.removeItem(KALIT(kompaniyaId)); else localStorage.setItem(KALIT(kompaniyaId), manba); } catch { /* brauzer cheklovi */ }
}
