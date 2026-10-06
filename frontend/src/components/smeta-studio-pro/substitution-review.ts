import type { CatalogResource, Substitution } from '../../lib/smeta-studio/model';
import { normDec } from '../../lib/smeta-studio/model';

export type ReplacementReviewIssue = 'SOURCE_RESOURCE_UNKNOWN' | 'RESOURCE_TYPE_UNKNOWN' | 'RESOURCE_TYPE_MISMATCH'
  | 'UNIT_UNKNOWN' | 'UNIT_CONVERSION_EVIDENCE_REQUIRED' | 'CONVERSION_INVALID' | 'REASON_REQUIRED';

/** UI preflight only. Backend/command validation remains mandatory; semantic fit is never invented. */
export function reviewSubstitution(source: CatalogResource | null, requested: Substitution): {
  issues: ReplacementReviewIssue[]; readyForOperatorReview: boolean;
} {
  const issues: ReplacementReviewIssue[] = [];
  if (!source) issues.push('SOURCE_RESOURCE_UNKNOWN');
  if (!source?.type || !requested.resource.type) issues.push('RESOURCE_TYPE_UNKNOWN');
  else if (source.type !== requested.resource.type) issues.push('RESOURCE_TYPE_MISMATCH');
  if (!source?.unitCode || !requested.resource.unitCode) issues.push('UNIT_UNKNOWN');
  let conversion: string | null = null;
  try { conversion = normDec(requested.conversion); } catch { /* invalid is reported below */ }
  if (conversion === null || conversion === '0') issues.push('CONVERSION_INVALID');
  // Even factor=1 requires evidence when units differ. An equal factor never establishes equivalence.
  if ((source?.unitCode !== requested.resource.unitCode || conversion !== '1') && !requested.conversionEvidence?.trim()) {
    issues.push('UNIT_CONVERSION_EVIDENCE_REQUIRED');
  }
  if (!requested.reason.trim()) issues.push('REASON_REQUIRED');
  return { issues, readyForOperatorReview: issues.length === 0 };
}
