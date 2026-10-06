/**
 * Smeta studio draft model — ONE command layer for the manual editor and the chat/voice
 * assistant. A normative catalogue work is never the estimate entity: every placement is
 * its own occurrence (stable UUID) with a frozen snapshot of the source recipe, so later
 * catalogue revisions cannot silently change a draft. Operator decisions (price basis,
 * resource substitution, norm override) are separate override records with evidence.
 *
 * Decimals are canonical strings; NULL means unknown and is never treated as zero.
 */
export type Dec = string;
export const STUDIO_SCHEMA = 'smeta-studio-v1' as const;

export type CatalogResource = { id: string; code: string | null; name: string | null; unitCode: string | null; type: string | null;
  /** Resource code (KodR, e.g. 000001) as printed in ABC LRV/RES; optional for older drafts. */
  resourceIdCode?: string | null };
export type RecipeSnapshot = {
  recipeId: string; status: 'EXACT' | 'AMBIGUOUS' | 'MISSING'; resource: CatalogResource | null;
  /** Source consumption per `basis.scale` work units; NULL = unknown in source. */
  norm: Dec | null; candidates: CatalogResource[]; candidateCount: number;
  prices: Array<{ id: string; region: string | null; price: string | null; transport: string | null }>; priceCount: number;
};
export type WorkSource = { catalogRevision: string; workId: string; code: string; name: string | null; unitCode: string | null; tableLabel: string | null };
export type UnitBasis = {
  /** Normative physical scale, e.g. "100" for a norm per 100 m3. NULL until confirmed. */
  scale: Dec | null; unitLabel: string | null; evidence: string | null;
  origin: 'OBSERVED' | 'OPERATOR' | null;
};
/** Distinct price meanings are never mixed. CERTIFIED_F2 is read-only history, not a draft basis. */
export type PriceBasis = 'CATALOG_CANDIDATE' | 'CONTRACT_DRAFT' | 'PROCUREMENT_ACTUAL' | 'OPERATOR_MANUAL';
export type PriceChoice = { value: Dec; basis: PriceBasis; evidence: string; sourcePriceId: string | null };
export type Substitution = {
  resource: CatalogResource; reason: string;
  /** Selected-resource units per one original unit (1 when units match). */
  conversion: Dec; conversionEvidence: string | null;
  /** Optional override of the normative consumption, with its own evidence. */
  normOverride: { value: Dec; evidence: string } | null;
};
export type ResourceOverride = { price?: PriceChoice | null; substitution?: Substitution | null };
export type Occurrence = {
  id: string; sectionId: string; source: WorkSource;
  /** Physical work quantity in basis units (e.g. 4 for 4 m3). */
  quantity: Dec | null; basis: UnitBasis; recipe: RecipeSnapshot[];
  overrides: Record<string, ResourceOverride>;
};
export type Section = { id: string; name: string; parentId: string | null; children: string[]; items: string[] };
export type EstimateContext = { companyId: number | null; projectId: number | null; objectId: number | null; objectLabel: string; title: string };
export type EstimateDoc = {
  schema: typeof STUDIO_SCHEMA; draftId: string; currency: string;
  context: EstimateContext; rootOrder: string[];
  sections: Record<string, Section>; occurrences: Record<string, Occurrence>;
  /** Local edit counter (not the canonical optimistic-lock version). */
  edits: number;
};

export function emptyDoc(draftId: string, currency = 'UZS'): EstimateDoc {
  return { schema: STUDIO_SCHEMA, draftId, currency,
    context: { companyId: null, projectId: null, objectId: null, objectLabel: '', title: '' },
    rootOrder: [], sections: {}, occurrences: {}, edits: 0 };
}

const DEC = /^\d{1,15}(?:\.\d{1,12})?$/;
/** Accepts "4", "4,5", "4.50"; returns canonical text or throws. Negative not allowed. */
export function normDec(v: string, code = 'DECIMAL_INVALID'): Dec {
  const s = String(v).trim().replace(',', '.');
  if (!DEC.test(s)) throw new Error(code);
  const [i, f] = s.split('.');
  const int = i.replace(/^0+(?=\d)/, ''), frac = (f ?? '').replace(/0+$/, '');
  return frac ? `${int}.${frac}` : int;
}
