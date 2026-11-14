/**
 * birlik.ts — loyiha va smeta birliklarini umumiy bazaga keltirish (SQL `_t2_lm_baza/_t2_lm_koef` bilan bir xil qoida).
 * '100 м3' -> m3 x100, 't' -> kg x1000. Noma'lum birlik yoki miqdor -> null (0 emas).
 */
export type BazaBirlik = 'm3' | 'm2' | 'm' | 'kg' | 'dona';
export type BirlikTahlil = { baza: BazaBirlik | null; koef: number };

const JADVAL: Record<string, BazaBirlik> = {
  'м3': 'm3', 'м³': 'm3', m3: 'm3', 'куб': 'm3', 'кубм': 'm3',
  'м2': 'm2', 'м²': 'm2', m2: 'm2',
  'м': 'm', m: 'm', 'пм': 'm', 'погм': 'm', pm: 'm',
  'т': 'kg', t: 'kg', 'тн': 'kg', tn: 'kg', 'тонна': 'kg', tonna: 'kg', 'кг': 'kg', kg: 'kg',
  'шт': 'dona', dona: 'dona', sht: 'dona', 'комп': 'dona', komp: 'dona',
};
const TONNA = new Set(['т', 't', 'тн', 'tn', 'тонна', 'tonna']);

function asos(raw: string): string {
  return raw.trim().toLowerCase().replace(/^[0-9]+([.,][0-9]+)?\s*/, '').replace(/[.\s]/g, '');
}

export function birlikTahlil(raw: string | null | undefined): BirlikTahlil {
  const s = (raw ?? '').trim().toLowerCase();
  const a = asos(s);
  const baza = JADVAL[a] ?? null;
  const m = /^([0-9]+(?:[.,][0-9]+)?)\s*/.exec(s);
  let koef = m ? Number(m[1].replace(',', '.')) : 1;
  if (!(koef > 0) || !Number.isFinite(koef)) koef = 1;
  if (TONNA.has(a)) koef *= 1000;
  return { baza, koef };
}

/** Miqdorni baza birlikka keltiradi; noma'lum -> null. */
export function normMiqdor(miqdor: number | null | undefined, birlik: string | null | undefined): number | null {
  if (miqdor == null || !Number.isFinite(miqdor)) return null;
  const b = birlikTahlil(birlik);
  return b.baza == null ? null : miqdor * b.koef;
}

/** Baza birlikdagi miqdorni berilgan (xom) birlikka qaytaradi. */
export function birlikkaQaytar(norm: number | null, birlik: string | null | undefined): number | null {
  if (norm == null) return null;
  const b = birlikTahlil(birlik);
  return b.baza == null ? null : norm / b.koef;
}

export function birlikMosmi(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = birlikTahlil(a).baza; const y = birlikTahlil(b).baza;
  return x != null && x === y;
}
