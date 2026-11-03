/**
 * Forma-3 shakli tanlovi (egasi 2026-11-03): «To'liq» yoki «Bir qatorli» — hujjat yasalayotganda tanlanadi.
 * Oylik paketda qo'shimcha «ikkalasi ham». Tanlov kompaniya bo'yicha localStorage da eslab qolinadi — FAQAT qulaylik
 * (try/catch; storage bo'lmasa sukut «to'liq»). Yadro/summalarga ta'sir qilmaydi.
 */
import { forma3SotuvdanXlsx, f3ShaklTozala, type Forma3Shakl } from './forma3-export';
import type { ImzoNomlar } from './hujjat-yozuvchi';
import type { SvodShartnoma } from './nakopitelniy-svod';

/** Tanlov joyi: Forma-3 sahifasi/tugmasi yoki oylik paket. */
export type F3TanlovJoyi = 'sahifa' | 'paket';
/** Paketda «ikkalasi ham» ham bor. */
export type PaketF3Tanlov = Forma3Shakl | 'ikkalasi';

const kalit = (joy: F3TanlovJoyi, kompaniyaId: number | string | null | undefined) => `forma3.shakl.v1:${joy}:${kompaniyaId ?? '-'}`;

function oqi(joy: F3TanlovJoyi, kompaniyaId: number | string | null | undefined): string | null {
  try { return window.localStorage.getItem(kalit(joy, kompaniyaId)); } catch { return null; }
}
function yoz(joy: F3TanlovJoyi, kompaniyaId: number | string | null | undefined, qiymat: string): void {
  try { window.localStorage.setItem(kalit(joy, kompaniyaId), qiymat); } catch { /* storage yo'q — tanlov eslanmaydi */ }
}

/** Sahifa tanlovi (sukut: to'liq). */
export const f3ShaklOl = (kompaniyaId: number | string | null | undefined): Forma3Shakl => f3ShaklTozala(oqi('sahifa', kompaniyaId));
export const f3ShaklSaqla = (kompaniyaId: number | string | null | undefined, shakl: Forma3Shakl): void => yoz('sahifa', kompaniyaId, shakl);

/** Paket tanlovi (sukut: to'liq). */
export function f3PaketTanlovOl(kompaniyaId: number | string | null | undefined): PaketF3Tanlov {
  const x = oqi('paket', kompaniyaId);
  return x === 'ikkalasi' ? 'ikkalasi' : f3ShaklTozala(x);
}
export const f3PaketTanlovSaqla = (kompaniyaId: number | string | null | undefined, tanlov: PaketF3Tanlov): void => yoz('paket', kompaniyaId, tanlov);

/** Paketga qaysi shakl(lar) kiradi. */
export const paketShakllari = (tanlov: PaketF3Tanlov): Forma3Shakl[] => (tanlov === 'ikkalasi' ? ['toliq', 'bir_qatorli'] : [tanlov]);

/** Bir sotuv F3 sining tanlangan shakl(lar)dagi Excel fayllari (paket yig'uvchisi shundan foydalanadi). */
export function forma3SotuvFayllari(sh: SvodShartnoma, f3Id: number, tanlov: PaketF3Tanlov, o: { tashkilot?: string | null; imzo?: ImzoNomlar } = {}): Array<{ shakl: Forma3Shakl; bytes: Uint8Array; faylNomi: string }> {
  const out: Array<{ shakl: Forma3Shakl; bytes: Uint8Array; faylNomi: string }> = [];
  for (const shakl of paketShakllari(tanlov)) {
    const h = forma3SotuvdanXlsx(sh, f3Id, { ...o, shakl });
    if (h) out.push({ shakl, ...h });
  }
  return out;
}
