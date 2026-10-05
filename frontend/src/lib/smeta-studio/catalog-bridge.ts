/**
 * Catalogue → draft snapshot. Freezes the complete source recipe (all pages, not only the
 * 25 rows on screen) together with the catalogue revision, and proposes a unit basis only
 * from the OBSERVED KodI dictionary. Unobserved units stay unconfirmed (operator input).
 */
import type { NormDetailSource } from '../catalog-extraction/norm-remote';
import type { UnitEntry } from '../catalog-extraction/norm-shards';
import type { RecipeSnapshot, UnitBasis, WorkSource } from './model';

export function snapshotWork(catalog: NormDetailSource, workId: string, catalogRevision: string, tableLabel: string | null) {
  const first = catalog.detail(workId);
  if (first.workCodeAmbiguous) throw new Error('WORK_AMBIGUOUS');
  if (first.recipeCount > 1000) throw new Error('RECIPE_LIMIT_REVIEW_REQUIRED');
  const recipe: RecipeSnapshot[] = [];
  for (let page = 0; page * 25 < first.recipeCount; page++) {
    const d = page === 0 ? first : catalog.detail(workId, page);
    for (const r of d.recipes) recipe.push({
      recipeId: r.id, status: r.resourceStatus as RecipeSnapshot['status'],
      resource: r.resourceStatus === 'EXACT' ? r.candidates[0] : null, norm: r.norm,
      candidates: r.candidates, candidateCount: r.candidateCount,
      prices: r.prices.map(p => ({ id: p.id, region: p.regionCode, price: p.price, transport: p.transport })), priceCount: r.priceCount,
    });
  }
  const w = first.work;
  const source: WorkSource = { catalogRevision, workId: w.id, code: w.code, name: w.name, unitCode: w.unitCode, tableLabel };
  return { source, recipe };
}

/** Observed unit → basis with explicit evidence text; anything else → unconfirmed. */
export function suggestedBasis(unitCode: string | null, unit: UnitEntry | null): UnitBasis {
  if (!unit || unit.status !== 'OBSERVED' || unit.scale == null || unit.base == null)
    return { scale: null, unitLabel: null, evidence: null, origin: null };
  return { scale: unit.scale, unitLabel: unit.base, origin: 'OBSERVED',
    evidence: `KodI ${unitCode} = ${unit.text}: tizimdagi import qilingan smetalarda ${unit.observations} marta kuzatilgan, ziddiyat yo‘q` };
}
