/**
 * Normative resource unit codes (KodI) → unit text, OBSERVED in the smetas imported into the system.
 *
 * The source normative database ships unit CODES only; the dictionary is not part of it (Codex QA:
 * "structured unit codes dictionary not proven"). Evidence (2026-10-06, production t2_qator, resources
 * rs/mat/ob): catalogue resources joined to imported smeta resource rows by their 6-digit resource code
 * (KodR), 701 sampled codes over 62 KodI values. Every KodI below mapped to exactly ONE unit text — zero
 * conflicts — with n observations and k distinct resource codes. Unlisted codes stay unknown (no guess).
 */
export const RESOURCE_UNITS: Readonly<Record<string, { text: string; n: number; codes: number }>> = {
  '001': { text: 'чел-ч', n: 16961, codes: 4 },
  '003': { text: 'м3', n: 2140, codes: 12 },
  '005': { text: 'кг', n: 248, codes: 6 },
  '006': { text: 'т', n: 937, codes: 7 },
  '010': { text: 'маш-ч', n: 100, codes: 3 },
  '011': { text: 'маш-ч', n: 16291, codes: 15 },
  '021': { text: 'м2', n: 779, codes: 5 },
  '023': { text: 'м', n: 22, codes: 4 },
  '024': { text: '1000 шт', n: 160, codes: 3 },
  '025': { text: '100 шт', n: 384, codes: 8 },
  '028': { text: 'компл', n: 2, codes: 1 },
  '034': { text: '1000 м2', n: 34, codes: 2 },
  '037': { text: '10 шт', n: 320, codes: 8 },
  '039': { text: '100 м', n: 122, codes: 1 },
  '040': { text: '10 м2', n: 122, codes: 2 },
  '041': { text: 'л', n: 61, codes: 5 },
  '042': { text: '1000 м', n: 12, codes: 2 },
  '046': { text: '10 м', n: 8, codes: 1 },
  '064': { text: '100 шт', n: 8, codes: 1 },
  '070': { text: 'компл', n: 8, codes: 1 },
  '088': { text: '10 шт', n: 114, codes: 4 },
  '619': { text: 'маш-ч', n: 98, codes: 3 },
  '631': { text: 'кВт-ч', n: 12, codes: 1 },
  '640': { text: '1000 м', n: 30, codes: 2 },
};

export function resourceUnitText(code: string | null | undefined): string | null {
  return code ? RESOURCE_UNITS[code]?.text ?? null : null;
}
