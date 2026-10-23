import type { UnitBasis } from './model';

/** Parse only explicit physical scales in the pinned source measure, never names or quantities. */
export function sourceMeasureBasis(measure: string | null, revision: string): UnitBasis {
  const unknown: UnitBasis = { scale: null, unitLabel: null, evidence: null, origin: null };
  if (revision !== '66bb1a23bd18c63006d447b5' || !measure) return unknown;
  const text = measure.trim().toLowerCase().replace(/\u00a0/g, ' ').replace(/²/g, '2').replace(/³/g, '3');
  // Qualifiers identify the counted substance; composite units/ranges and other
  // descriptions stay manual. No dimensional conversion is performed.
  const match = /^(?:(\d+(?:[.,]\d+)?)\s*)?(м3|м2|м|т|кг|шт\.?|компл\.?)(?:\s+(?:грунта|бетона|раствора|кладки|поверхности|покрытия|конструкций))?$/.exec(text);
  if (!match) return unknown;
  const scale = (match[1] ?? '1').replace(',', '.');
  if (!/^\d{1,15}(?:\.\d{1,12})?$/.test(scale) || Number(scale) <= 0) return unknown;
  return { scale, unitLabel: match[2].replace(/\.$/, ''), origin: 'OPERATOR',
    evidence: `Normativ kutubxona ${revision}; manbadagi o‘lchov: ${measure}` };
}
