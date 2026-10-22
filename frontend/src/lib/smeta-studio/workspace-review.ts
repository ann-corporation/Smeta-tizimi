import type { EstimateDoc } from './model';
import type { DocCalc, LineIssue } from './calc';

export type ReviewIssue = LineIssue | 'RECIPE_EMPTY' | 'COEFFICIENT_PENDING';
export type WorkReview = { occurrenceId: string; code: string; name: string | null; issues: ReviewIssue[] };
/** Projection of the existing calculator, never a second total or an AI verdict. */
export function workspaceReview(doc: EstimateDoc, calc: DocCalc): WorkReview[] {
  return Object.values(doc.occurrences).flatMap(work => {
    const issues = new Set<ReviewIssue>(calc.occurrences[work.id]?.issues ?? []);
    for (const line of calc.occurrences[work.id]?.lines ?? []) for (const issue of line.issues) issues.add(issue);
    if (!work.recipe.length) issues.add('RECIPE_EMPTY');
    if ((work.coefficients ?? []).some(c => !c.accepted)) issues.add('COEFFICIENT_PENDING');
    return issues.size ? [{ occurrenceId: work.id, code: work.source.code, name: work.source.name, issues: [...issues] }] : [];
  });
}
