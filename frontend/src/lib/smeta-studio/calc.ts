/**
 * Deterministic draft calculation. Resource quantity = work quantity × norm × conversion
 * ÷ basis scale, rounded half-away to 6 places; line amount = quantity × price rounded to
 * 2 places (line-level rounding, then exact sums). Any unknown input keeps the result NULL:
 * totals are reported as `amount` (NULL if anything is unknown) plus `knownAmount` and an
 * `unresolved` count, so the operator always sees what is missing instead of a fake total.
 */
import { previewResourceAmount, previewResourceQuantity } from '../catalog-extraction/norm-catalog';
import type { CatalogResource, EstimateDoc, Occurrence, PriceBasis } from './model';

export type LineIssue = 'RESOURCE_UNRESOLVED' | 'NORM_UNKNOWN' | 'PRICE_MISSING' | 'QUANTITY_MISSING' | 'BASIS_UNCONFIRMED';
export type LineCalc = {
  recipeId: string; resource: CatalogResource | null; original: CatalogResource | null; substituted: boolean;
  norm: string | null; normOverridden: boolean; quantity: string | null;
  price: string | null; priceBasis: PriceBasis | null; amount: string | null; issues: LineIssue[];
};
export type Totals = { amount: string | null; knownAmount: string; unresolved: number };
export type OccurrenceCalc = Totals & { id: string; lines: LineCalc[]; issues: LineIssue[] };
export type SectionCalc = Totals & { id: string };
export type DocCalc = { occurrences: Record<string, OccurrenceCalc>; sections: Record<string, SectionCalc>; total: Totals };

const cents = (v: string) => { if (!/^\d+\.\d{2}$/.test(v)) throw new Error('MONEY_INVALID'); return BigInt(v.replace('.', '')); };
const money = (c: bigint) => { const t = c.toString().padStart(3, '0'); return t.slice(0, -2) + '.' + t.slice(-2); };

/** Exact decimal product of two canonical non-negative decimals. */
export function mulDec(a: string, b: string): string {
  const [ai, af = ''] = a.split('.'), [bi, bf = ''] = b.split('.');
  const places = af.length + bf.length, p = (BigInt(ai + af) * BigInt(bi + bf)).toString().padStart(places + 1, '0');
  return places ? p.slice(0, -places) + '.' + p.slice(-places) : p;
}

function sum(parts: Totals[] | Array<string | null>): Totals {
  let known = 0n, unresolved = 0;
  for (const p of parts) {
    if (p == null) unresolved++;
    else if (typeof p === 'string') known += cents(p);
    else { known += cents(p.knownAmount); unresolved += p.unresolved; }
  }
  return { amount: unresolved ? null : money(known), knownAmount: money(known), unresolved };
}

export function calcOccurrence(o: Occurrence): OccurrenceCalc {
  const issues: LineIssue[] = [];
  if (o.quantity == null) issues.push('QUANTITY_MISSING');
  if (o.basis.scale == null) issues.push('BASIS_UNCONFIRMED');
  const lines = o.recipe.map((r): LineCalc => {
    const ov = o.overrides[r.recipeId] ?? {}, sub = ov.substitution ?? null;
    const lineIssues: LineIssue[] = [...issues];
    const resource = sub ? sub.resource : r.status === 'EXACT' ? r.resource : null;
    if (!resource) lineIssues.push('RESOURCE_UNRESOLVED');
    const norm = sub?.normOverride?.value ?? r.norm;
    if (norm == null) lineIssues.push('NORM_UNKNOWN');
    let quantity: string | null = null;
    if (resource && norm != null && o.quantity != null && o.basis.scale != null)
      quantity = previewResourceQuantity(o.quantity, sub ? mulDec(norm, sub.conversion) : norm, o.basis.scale, o.basis.evidence ?? '');
    const price = ov.price?.value ?? null;
    if (price == null) lineIssues.push('PRICE_MISSING');
    return { recipeId: r.recipeId, resource, original: r.resource, substituted: !!sub, norm, normOverridden: !!sub?.normOverride,
      quantity, price, priceBasis: ov.price?.basis ?? null, amount: previewResourceAmount(quantity, price), issues: lineIssues };
  });
  // A work without any recipe line has no computable cost: unknown, not zero.
  const t = lines.length ? sum(lines.map(l => l.amount)) : { amount: null, knownAmount: '0.00', unresolved: 1 };
  return { id: o.id, lines, issues, ...t };
}

export function calcDoc(doc: EstimateDoc): DocCalc {
  const occurrences: Record<string, OccurrenceCalc> = {};
  for (const o of Object.values(doc.occurrences)) occurrences[o.id] = calcOccurrence(o);
  const sections: Record<string, SectionCalc> = {};
  const walk = (id: string): Totals => {
    const s = doc.sections[id];
    const t = sum([...s.items.map(i => occurrences[i]), ...s.children.map(walk)]);
    sections[id] = { id, ...t };
    return t;
  };
  const total = sum(doc.rootOrder.map(walk));
  return { occurrences, sections, total };
}
