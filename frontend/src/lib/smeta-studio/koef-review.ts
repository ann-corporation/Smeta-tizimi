/** Reuse the draft calculator for before/after; never calculate a separate financial truth. */
import { calcOccurrence } from './calc';
import type { Occurrence, WorkCoefficient } from './model';
import { koefgaAylantir, type KoefNomzod } from './koef-katalog';

export function withNormativeRule(o: Occurrence, n: KoefNomzod): WorkCoefficient[] {
  const additions = koefgaAylantir(n, true);
  const ids = new Set(additions.map(c => c.id));
  return [...(o.coefficients ?? []).filter(c => !ids.has(c.id)), ...additions];
}

export function coefficientPreview(o: Occurrence, coefficients: WorkCoefficient[]) {
  const before = calcOccurrence(o), after = calcOccurrence({ ...o, coefficients });
  return { before, after, lines: before.lines.map((line, i) => ({
    id: line.recipeId, name: line.resource?.name ?? line.resource?.code ?? line.recipeId,
    beforeQuantity: line.quantity, afterQuantity: after.lines[i].quantity,
    beforeAmount: line.amount, afterAmount: after.lines[i].amount,
    changed: line.quantity !== after.lines[i].quantity,
  })) };
}
