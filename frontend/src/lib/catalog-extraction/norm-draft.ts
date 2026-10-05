import { NormCatalog, previewResourceAmount, previewResourceQuantity } from './norm-catalog';

/** Review draft only: source IDs are not t2_qator IDs. Backend must revalidate. */
export type NormDraftRequest = {
  workId: string; quantity: string; basisQuantity: string;
  unitEvidence: string; unitLabel: string; currency: string;
  priceEvidence: string; prices: Record<string, string>;
};
export type NormDraftLine = {
  sourceWorkId: string; code: string; name: string | null; collection: string | null;
  quantity: string; basisQuantity: string; unitLabel: string; unitEvidence: string;
  currency: string; priceEvidence: string;
  resources: Array<{ sourceRecipeId: string; sourceResourceId: string | null; code: string | null;
    name: string | null; norm: string | null; quantity: string | null; draftPrice: string | null;
    amount: string | null; status: string }>;
  amount: string | null; unresolved: number;
};
export type NormSmetaDraft = { schema: 'norm-smeta-review-v1'; status: 'REVIEW_ONLY'; lines: NormDraftLine[] };
export interface NormSmetaReviewPort {
  /** No approval or canonical mutation implied. Implementer supplies actor/tenant validation. */
  saveReview(input: { companyId: number; projectId: number | null; objectId: number | null;
    operationId: string; sourceDocumentIds: string[]; draft: NormSmetaDraft }): Promise<{ id: string; version: number }>;
}

export function sumDraftAmounts(values: Array<string | null>): string | null {
  let cents = 0n;
  for (const value of values) {
    if (value == null) return null;
    if (!/^\d+\.\d{2}$/.test(value)) throw new Error('MONEY_INVALID');
    cents += BigInt(value.replace('.', ''));
  }
  const text = cents.toString().padStart(3, '0');
  return text.slice(0, -2) + '.' + text.slice(-2);
}

export function buildNormDraftLine(catalog: NormCatalog, request: NormDraftRequest): NormDraftLine {
  const first = catalog.detail(request.workId);
  if (first.workCodeAmbiguous) throw new Error('WORK_AMBIGUOUS');
  if (!request.unitLabel.trim() || !request.currency.trim()) throw new Error('CONTEXT_REQUIRED');
  // Validate quantity/base even when the work has no resource recipe.
  previewResourceQuantity(request.quantity, '1', request.basisQuantity, request.unitEvidence);
  if (first.recipeCount > 1000) throw new Error('RECIPE_LIMIT_REVIEW_REQUIRED');
  const resources: NormDraftLine['resources'] = [];
  for (let page = 0; page * 25 < first.recipeCount; page++) {
    const detail = page === 0 ? first : catalog.detail(request.workId, page);
    for (const recipe of detail.recipes) {
      const exact = recipe.resourceStatus === 'EXACT';
      const quantity = exact ? previewResourceQuantity(request.quantity, recipe.norm, request.basisQuantity, request.unitEvidence) : null;
      const price = request.prices[recipe.id]?.trim() || null;
      if (price != null && !request.priceEvidence.trim()) throw new Error('PRICE_EVIDENCE_REQUIRED');
      const amount = exact ? previewResourceAmount(quantity, price) : null;
      resources.push({ sourceRecipeId: recipe.id, sourceResourceId: exact ? recipe.candidates[0].id : null,
        code: recipe.resourceCode ?? recipe.resourceIdCode, name: exact ? recipe.candidates[0].name : null,
        norm: recipe.norm, quantity, draftPrice: price, amount, status: recipe.resourceStatus });
    }
  }
  return { sourceWorkId: first.work.id, code: first.work.code, name: first.work.name,
    collection: first.work.collection, quantity: request.quantity, basisQuantity: request.basisQuantity,
    unitLabel: request.unitLabel.trim(), unitEvidence: request.unitEvidence.trim(), currency: request.currency.trim(),
    priceEvidence: request.priceEvidence.trim(), resources,
    amount: resources.length ? sumDraftAmounts(resources.map(r => r.amount)) : null,
    unresolved: resources.length ? resources.filter(r => r.amount == null).length : 1 };
}
