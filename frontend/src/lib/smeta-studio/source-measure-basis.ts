import type { UnitBasis } from './model';

// Literal measures observed in this pinned release. Descriptions qualify what
// is counted; they never introduce a conversion or a guessed measurement.
const DESCRIPTIONS: Readonly<Record<string, readonly string[]>> = {
  'м3': ['грунта по проектному наружному очертанию конструкции', 'бетона по проектному наружному очертанию конструкции',
    'сборных конструкций', 'железобетона в деле', 'бетона, бутобетона и железобетона в деле'],
  'м2': ['окрашиваемой поверхности', 'отремонтированной поверхности'],
  'м': ['трубопровода', 'трубопроводов', 'бурения скважины', 'газопровода', 'қувур'],
  'км': ['трубопровода', 'труб', 'пути', 'траншеи'],
  'шт': ['сборных конструкций'],
};

/** Parse only explicit physical scales in the pinned source measure, never names or quantities. */
export function sourceMeasureBasis(measure: string | null, revision: string): UnitBasis {
  const unknown: UnitBasis = { scale: null, unitLabel: null, evidence: null, origin: null };
  if (revision !== '66bb1a23bd18c63006d447b5' || !measure) return unknown;
  const text = measure.trim().toLowerCase().replace(/\s+/g, ' ').replace(/²/g, '2').replace(/³/g, '3');
  // Qualifiers identify the counted substance; composite units/ranges and other
  // descriptions stay manual. No dimensional conversion is performed.
  const match = /^(?:(\d+(?:[.,]\d+)?)\s*)?(м3|м2|км|м|т|кг|шт\.?|компл\.?)(?:\s+(грунта|бетона|раствора|кладки|поверхности|покрытия|конструкций))?$/.exec(text)
    ?? /^(?:(\d+(?:[.,]\d+)?)\s*)?(м3|м2|км|м|шт\.?)(?:\s+(.+))$/.exec(text)
    ?? /^(?:(\d+(?:[.,]\d+)?)\s*)?(стык|изделие|опора|установка|узел|комплект|га|кран|устройство|скважина|приборов|расчалка \(оттяжка\))$/.exec(text);
  if (!match) return unknown;
  const unit = match[2].replace(/\.$/, '');
  if (match[3] && !/^(грунта|бетона|раствора|кладки|поверхности|покрытия|конструкций)$/.test(match[3])
    && !DESCRIPTIONS[unit]?.includes(match[3])) return unknown;
  const scale = (match[1] ?? '1').replace(',', '.');
  if (!/^\d{1,15}(?:\.\d{1,12})?$/.test(scale) || Number(scale) <= 0) return unknown;
  return { scale, unitLabel: unit, origin: 'OPERATOR',
    evidence: `Normativ kutubxona ${revision}; manbadagi o‘lchov: ${measure}` };
}
