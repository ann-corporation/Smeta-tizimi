/**
 * Kiritmalar → saqlash paketi (delta): `jurnalPaket` + tuzatish (qalinlik/norma) deltalari.
 * Fakt jurnali va Ish varag'i uchun yagona (FaktJurnal'dan CHIQARILGAN).
 */
import { jurnalPaket, type Kiritma } from '../fakt-jurnal';
import type { FormulaContext } from '../formula/number-formula';
import { tuzatishPaketi } from '../fakt-tuzatish';
import type { tuzatishBoglanishlari } from '../smeta-anatomiya/tuzatish';

export function faktPaketiQur(
  kiritmalar: Readonly<Record<number, Kiritma>>,
  faktlar: ReadonlyMap<number, number>,
  smetalar: ReadonlyMap<number, number | null>,
  tuzatish: ReturnType<typeof tuzatishBoglanishlari>,
  kontekstlar?: ReadonlyMap<number, FormulaContext>,
) {
  const p = jurnalPaket(kiritmalar, faktlar, smetalar, kontekstlar);
  const tz = tuzatishPaketi(p.qatorlar, tuzatish, faktlar, smetalar);
  return { ...p, qatorlar: tz.qatorlar, tuzatishlar: tz.tuzatishlar, ok: p.xatolar.size === 0 && tz.qatorlar.length > 0 };
}
export type FaktPaketi = ReturnType<typeof faktPaketiQur>;
