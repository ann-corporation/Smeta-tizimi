/**
 * Oylik paket: yordamchi (toza) funksiyalar. Yangi hisob YO'Q.
 *  - `parallelIsh`: tartibni saqlagan holda n ta parallel ish (paket fayllarini yasash: 4 parallel, «N/M tayyor»).
 *  - `paketTokeniYech`: paketning BITTA token yechimi, hujjat bo'yicha dedup bilan. Har hujjat xeshi (`fayl_xeshlar`) serverga ketadi;
 *    server faqat avval to'lanmagan hujjatlarni to'laydi — bir hujjatni qayta yuklash qayta to'lanmaydi (egasi qoidasi).
 */
import { mazmunXeshi } from '../../api/mazmun-xesh';
import { hujjatTokenBilan, type HujjatTokenNatija } from '../token-hujjat';
import { xlsxYacheykaSoni } from '../xlsx-yacheyka';
import { parallelIsh } from './parallel';
export { parallelIsh };



/** Tokenlanishi kerak hujjat (paketga kiradigan, mijozda yasalgan). */
export type TolovHujjat = { bytes: Uint8Array; hujjat: string; sabab: string; obyekt?: number | null };

/** Paket tokeni: bitta chaqiruv. Bo'sh ro'yxat — to'lov yo'q. Xato bo'lsa hech narsa yechilmagan (server atomik). */
export async function paketTokeniYech(p: { kompaniyaId: number; hujjatlar: readonly TolovHujjat[]; sabab: string }, d?: Parameters<typeof hujjatTokenBilan>[2]): Promise<HujjatTokenNatija> {
  if (!p.hujjatlar.length) return { ok: true, xabar: '', sarflandi: 0, yacheykalar: 0, bepulTakror: false };
  const xeshlar = await Promise.all(p.hujjatlar.map((h) => (d?.mazmunXeshi ?? mazmunXeshi)(h.bytes)));
  const fayllar = p.hujjatlar.map((h) => xlsxYacheykaSoni(h.bytes));
  return hujjatTokenBilan({ kompaniyaId: p.kompaniyaId, bytes: p.hujjatlar[0].bytes, hujjat: 'PAKET', sabab: p.sabab, fayllar, xeshlar }, () => undefined, d);
}