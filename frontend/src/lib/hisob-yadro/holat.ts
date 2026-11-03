/** Active packet row derivation. Source F2 and fakt amounts stay frozen.
 * Monetary operations delegate to the current canonical core; no podval evaluation here.
 */
import { faktSummaF2Narxda, f2MumkinIshorali, qoldiq } from './korinish';
export type HolatAsos = {
  hajm: number | null; summa: number | null;
  faktH: number | null; faktS: number | null;
  f2H: number | null; f2S: number | null;
  f2SummaYoq?: number | null;
  alH: number | null; alS: number | null;
};

export function holatHosilalari(a: HolatAsos) {
  // Packet faktS is already the server view amount. Keep it intact; only derive availability.
  // Do not reconstruct an unknown Fakt amount from a known F2 price.
  const fakt = a.faktS == null ? null : faktSummaF2Narxda(a.faktH, a.f2H, a.f2S, a.faktS, a.f2SummaYoq).summa;
  return {
    smeta_hajm: a.hajm, smeta_summa: a.summa,
    // Quantity precision follows SQL (no monetary rounding).
    qoldiq_hajm: a.hajm == null || a.alH == null ? null : a.hajm - (a.f2H ?? 0) - a.alH,
    qoldiq_summa: qoldiq(a.summa, a.f2S, a.alS),
    f2_mumkin_hajm: f2MumkinIshorali(a.faktH, a.f2H, a.hajm),
    f2_mumkin_summa: f2MumkinIshorali(fakt, a.f2S, a.hajm),
  };
}
