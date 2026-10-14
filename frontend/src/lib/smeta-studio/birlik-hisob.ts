/**
 * O'lcham bo'yicha birlik qayta hisobi (egasi 2026-10-14: "m2 ga berilgan, o'lchamlari berilgan bo'lsa kalkulyatsiyasini
 * hisoblab m ga bera oladigan darajada ishlashi kerak").
 *
 * Smeta narxi = manba narxi × koeffitsient. Koeffitsient formulasini AI (yoki operator) yozadi, lekin:
 *   • formula faqat sonlar va + − × ÷ ( ) dan iborat, KOD hisoblaydi (aniq kasr arifmetikasi);
 *   • formuladagi har bir son resurs yoki manba qatorining NOMIDA yozilgan bo'lishi shart — yoki birlik
 *     o'tkazish konstantasi (10, 100, 1000). O'ylab topilgan son (zichlik, og'irlik…) o'tmaydi;
 *   • ikkala birlik ham fizik (m, m², m³, dona, t, kg, l, komplekt) — soat birliklari hech qachon.
 */
import { ifodaHisobla } from '../smeta-ai/ifoda';
import { unitKey } from './resource-match';

const FIZIK = new Set(['М', 'М2', 'М3', 'ШТ', 'Т', 'КГ', 'Л', 'КОМПЛ', 'ЛИСТ', 'РУЛОН', 'УПАК', 'ПАЧКА', 'МЕШОК', 'ТЫСШТ']);
const KONSTANTALAR = new Set(['1', '10', '100', '1000']);

/** Can a price in `manba` unit be recalculated into the estimate unit through product dimensions? */
export function olchamliOtkazishMumkin(smetaBirlik: string | null, manbaBirlik: string | null): boolean {
  const a = unitKey(smetaBirlik), b = unitKey(manbaBirlik);
  return !!a && !!b && a !== b && FIZIK.has(a) && FIZIK.has(b);
}

/** Every number written in the names ("2440х1220", "толщ. 0,5 мм", "масса 1 м 4,5 кг"), canonical decimal form. */
export function nomdagiSonlar(nomlar: readonly (string | null | undefined)[]): Set<string> {
  const out = new Set<string>();
  for (const n of nomlar) for (const m of String(n ?? '').matchAll(/\d+(?:[.,]\d+)?/g)) out.add(kanon(m[0]));
  return out;
}
const kanon = (s: string) => { const v = s.replace(',', '.'); return v.includes('.') ? v.replace(/0+$/, '').replace(/\.$/, '') : v.replace(/^0+(?=\d)/, ''); };

export type BirlikHisob = { formula: string; factor: string; note: string };
export type BirlikHisobXato = 'FORMULA_NOTOGRI' | 'SON_NOMDA_YOQ' | 'BIRLIK_MOS_EMAS' | 'KOEFFITSIENT_CHEGARADAN_TASHQARI';

/**
 * Validates and computes a recalculation. `nomlar` = estimate resource name and source row name (the only allowed
 * evidence for dimensions). Returns the factor as an exact decimal string, or the reason it is refused.
 */
export function olchamliHisob(formula: string, note: string, smetaBirlik: string | null, manbaBirlik: string | null,
  nomlar: readonly (string | null | undefined)[]): BirlikHisob | { xato: BirlikHisobXato } {
  if (!olchamliOtkazishMumkin(smetaBirlik, manbaBirlik)) return { xato: 'BIRLIK_MOS_EMAS' };
  let qiymat: string, ifoda: string;
  try { ({ qiymat, ifoda } = ifodaHisobla(formula)); } catch { return { xato: 'FORMULA_NOTOGRI' }; }
  const ruxsat = nomdagiSonlar(nomlar);
  const sonlar = [...String(formula).replace(/(\d)\s+(?=\d{3}(?!\d))/g, '$1').matchAll(/\d+(?:[.,]\d+)?/g)].map(m => kanon(m[0]));
  if (!sonlar.length || sonlar.some(s => !ruxsat.has(s) && !KONSTANTALAR.has(s))) return { xato: 'SON_NOMDA_YOQ' };
  const k = Number(qiymat);
  if (!(k > 0) || k > 1_000_000 || k < 0.000001) return { xato: 'KOEFFITSIENT_CHEGARADAN_TASHQARI' };
  return { formula: ifoda, factor: qiymat, note: String(note ?? '').trim().slice(0, 300) };
}

export const BIRLIK_HISOB_XATO_MATNI: Record<BirlikHisobXato, string> = {
  FORMULA_NOTOGRI: 'qayta hisob formulasi noto‘g‘ri',
  SON_NOMDA_YOQ: 'formulada nomlarda yozilmagan son bor (o‘ylab topilgan o‘lcham qabul qilinmaydi)',
  BIRLIK_MOS_EMAS: 'bu birliklar o‘lcham orqali o‘tkazilmaydi',
  KOEFFITSIENT_CHEGARADAN_TASHQARI: 'qayta hisob koeffitsienti aqlga sig‘maydi',
};
