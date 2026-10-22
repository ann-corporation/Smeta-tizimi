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
export type PriceChoice = { value: Dec; basis: PriceBasis; evidence: string; sourcePriceId: string | null;
  /** Structured «обоснование цены» (owner 2026-10-14: every price carries its basis); older drafts have only `evidence`. */
  justification?: PriceJustification | null };
/** Where a price comes from and how it was derived — printed in the «ОБОСНОВАНИЕ ЦЕН» sheet. */
export type PriceJustification = {
  /** CATALOG — «Каталог цен РУз» / main materials list; EXCHANGE — UzRTSB quotes; PRICE_LIST — a manufacturer's price list;
   *  COMMERCIAL_OFFER — a supplier's КП; COMPANY_ESTIMATE — a price from the company's earlier estimate (NOT a justification). */
  docType: 'CATALOG' | 'EXCHANGE' | 'PRICE_LIST' | 'COMMERCIAL_OFFER' | 'COMPANY_ESTIMATE' | 'LABOUR_HOUR' | 'MACHINE_HOUR' | 'MANUAL'
    /** A seller's web page found by the internet price agent; the page was opened and price/product verified on it (owner 2026-10-17). */
    | 'INTERNET';
  /** Document details: catalogue edition/period/region/VAT, estimate file/object, invoice No and date… */
  document: string;
  /** The source row as written there, its unit and price (in that unit). */
  sourceName: string | null; sourceUnit: string | null; sourcePrice: Dec | null;
  /** Unit recalculation: estimate price = source price × factor; formula uses only numbers stated in the names. */
  conversion: { formula: string; factor: Dec; note: string } | null;
  /** Why this source was chosen (AI or operator). */
  reason: string | null;
  /** Several suppliers offer the same product (owner 2026-10-17): sourcePrice is their arithmetic mean; prices in the source unit. */
  average?: { count: number; min: Dec; max: Dec; offers: Array<{ supplier: string; code: string | null; price: Dec }> } | null;
  /** INTERNET: the verified web pages (link, seller, price as written there, its unit and whether it includes VAT). */
  sources?: Array<{ url: string; name: string; price: Dec; unit: string | null; vat: boolean | null }> | null;
};
export type Substitution = {
  resource: CatalogResource; reason: string;
  /** Selected-resource units per one original unit (1 when units match). */
  conversion: Dec; conversionEvidence: string | null;
  /** Optional override of the normative consumption, with its own evidence. */
  normOverride: { value: Dec; evidence: string } | null;
};
/** `kat`: the markup category chosen for this resource (which percentages apply), overriding the automatic one. */
export type ResourceOverride = { price?: PriceChoice | null; substitution?: Substitution | null; kat?: string | null };
export type Occurrence = {
  id: string; sectionId: string; source: WorkSource;
  /** Physical work quantity in basis units (e.g. 4 for 4 m3). */
  quantity: Dec | null; basis: UnitBasis; recipe: RecipeSnapshot[];
  overrides: Record<string, ResourceOverride>;
  /** Work-condition coefficients (norm book technical part). Only `accepted` ones change quantities. */
  coefficients?: WorkCoefficient[];
  /** Material stated for the work ("Бетон B20", "Раствор цементный М100") — prices the norm's «по проекту» resources. */
  material?: string | null;
  /** -1: an «исключать» position (e.g. «на каждый 1 мм изменения толщины … исключать») — its quantities and costs count negative. */
  ishora?: -1;
};
/** Which resource quantities a coefficient multiplies. МАТ = every material category (МАТ/КАБ/М/К/БЕЗ СКЛАД). */
export type CoefScope = 'ALL' | 'ЧЕЛ' | 'МАШ' | 'ЧЕЛ+МАШ' | 'МАТ';
export type WorkCoefficient = { code?: string; basis?: string; id: string; name: string; value: Dec; scope: CoefScope; evidence: string;
  /** NORM = from the normative reference (ШНК technical part), AI = proposed by the smeta AI — neither is applied until accepted;
   *  OPERATOR = entered by a person. */
  origin: 'NORM' | 'AI' | 'OPERATOR'; accepted: boolean };
/** Markup rates (percent) of the pricing step; codes are the company cascade codes (t2_nakrutka). */
/** `podval`: a custom markup structure (rows: percent of chosen bases / fixed sum / total) instead of the standard cascade. */
export type EstimateRates = { values: Record<string, number>; source: string; podval?: Podval | null };
import type { Podval } from '../nakrutka-konstruktor';
export type Section ={ id: string; name: string; parentId: string | null; children: string[]; items: string[] };
export type EstimateContext = { companyId: number | null; projectId: number | null; objectId: number | null; objectLabel: string; title: string };
export type EstimateDoc = {
  schema: typeof STUDIO_SCHEMA; draftId: string; currency: string;
  context: EstimateContext; rootOrder: string[];
  sections: Record<string, Section>; occurrences: Record<string, Occurrence>;
  /** Local edit counter (not the canonical optimistic-lock version). */
  edits: number;
  /** Pricing-step markup rates; absent until the operator confirms them (then the RES carries the cascade). */
  rates?: EstimateRates | null;
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
