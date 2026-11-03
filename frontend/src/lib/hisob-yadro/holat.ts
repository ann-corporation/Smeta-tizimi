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

/** Quantity-only signed availability. No monetary rounding; numeric SQL inputs retain JS number precision.
 * Sign convention follows f2MumkinIshorali; NULL Fakt stays unknown.
 */
function mumkinHajm(fakt: number | null, f2: number | null, smeta: number | null): number | null {
  if (fakt == null || !Number.isFinite(fakt)) return null;
  const f = f2 != null && Number.isFinite(f2) ? f2 : 0;
  const manfiy = smeta != null && Number.isFinite(smeta) && smeta !== 0 ? smeta < 0 : fakt < 0 || f < 0;
  const farq = fakt - f;
  return manfiy ? Math.min(0, farq) : Math.max(0, farq);
}

export function holatHosilalari(a: HolatAsos) {
  // Packet faktS is already the server view amount. Keep it intact; only derive availability.
  // Do not reconstruct an unknown Fakt amount from a known F2 price.
  const f2NolNomalum = a.f2H != null && a.f2H !== 0 && a.f2S === 0 && a.f2SummaYoq == null;
  const fakt = a.faktS == null || f2NolNomalum ? null : faktSummaF2Narxda(a.faktH, a.f2H, a.f2S, a.faktS, a.f2SummaYoq).summa;
  return {
    smeta_hajm: a.hajm, smeta_summa: a.summa,
    // Quantity subtraction is unrounded; signed/null UI derivation is not raw SQL-view parity.
    qoldiq_hajm: a.hajm == null || a.alH == null ? null : a.hajm - (a.f2H ?? 0) - a.alH,
    qoldiq_summa: qoldiq(a.summa, a.f2S, a.alS),
    f2_mumkin_hajm: mumkinHajm(a.faktH, a.f2H, a.hajm),
    f2_mumkin_summa: f2MumkinIshorali(fakt, a.f2S, a.hajm),
  };
}
