/** Pure, NULL-safe reconciliation for an imported F2 act and its operator decisions.
 * Source certified amounts are copied as-is; reference-price comparison is a separate
 * informational view and never rewrites an F2 amount. */

export type F2LinkState = 'confirmed' | 'suggested' | 'unbound' | 'excluded';

export interface F2MoneyLine {
  state: F2LinkState;
  /** Exact amount read from the F2 source; null means unknown, not zero. */
  sourceAmount: number | null;
  sourceQuantity: number | null;
  /** Baseline/reference estimate unit price for the bound canonical row. */
  referenceUnitPrice: number | null;
}

export interface AmountSum {
  knownAmount: number;
  unknownCount: number;
  complete: boolean;
}

export interface F2LinkReconciliation {
  sourceLineCount: number;
  sourceAmount: AmountSum;
  declaredDocumentAmount: number | null;
  sourceVsDeclaredDifference: number | null;
  sourceVsDeclaredPercent: number | null;
  confirmedAmount: AmountSum;
  suggestedAmount: AmountSum;
  unboundAmount: AmountSum;
  excludedAmount: AmountSum;
  eligibleDocumentAmount: number | null;
  notYetConfirmedAmount: number | null;
  notYetConfirmedPercent: number | null;
  confirmedCoveragePercent: number | null;
  comparableReferenceAmount: AmountSum;
  f2VsReferenceDifference: number | null;
  f2VsReferencePercent: number | null;
}

interface AmountAccumulator { sum: AmountSum; correction: number }
function emptySum(): AmountAccumulator { return { sum: { knownAmount: 0, unknownCount: 0, complete: true }, correction: 0 }; }
function addAmount(acc: AmountAccumulator, amount: number | null): void {
  if (amount == null || !Number.isFinite(amount)) { acc.sum.unknownCount++; acc.sum.complete = false; return; }
  // Kahan compensation limits binary-float drift when thousands of money lines are added.
  const adjusted = amount - acc.correction;
  const next = acc.sum.knownAmount + adjusted;
  acc.correction = (next - acc.sum.knownAmount) - adjusted;
  acc.sum.knownAmount = next;
}

function amountWhenComplete(sum: AmountSum): number | null {
  return sum.complete ? sum.knownAmount : null;
}

/** Difference is only reported when both sides are fully known. */
export function reconcileF2Links(
  declaredDocumentAmount: number | null,
  lines: readonly F2MoneyLine[],
): F2LinkReconciliation {
  const sourceAccumulator = emptySum();
  const totals: Record<F2LinkState, AmountAccumulator> = {
    confirmed: emptySum(), suggested: emptySum(), unbound: emptySum(), excluded: emptySum(),
  };
  let referenceKnownAmount = 0;
  let referenceCorrection = 0;
  let referenceUnknownCount = 0;
  let confirmedLineCount = 0;
  for (const line of lines) {
    addAmount(sourceAccumulator, line.sourceAmount);
    addAmount(totals[line.state], line.sourceAmount);
    if (line.state !== 'confirmed') continue;
    confirmedLineCount++;
    if (line.sourceQuantity == null || !Number.isFinite(line.sourceQuantity)
      || line.referenceUnitPrice == null || !Number.isFinite(line.referenceUnitPrice)
      || line.sourceAmount == null || !Number.isFinite(line.sourceAmount)) {
      referenceUnknownCount++;
      continue;
    }
    const referenceLine = line.sourceQuantity * line.referenceUnitPrice;
    const adjustedReference = referenceLine - referenceCorrection;
    const nextReference = referenceKnownAmount + adjustedReference;
    referenceCorrection = (nextReference - referenceKnownAmount) - adjustedReference;
    referenceKnownAmount = nextReference;
  }
  const sourceAmount = sourceAccumulator.sum;
  const confirmedAmount = totals.confirmed.sum;
  const suggestedAmount = totals.suggested.sum;
  const unboundAmount = totals.unbound.sum;
  const excludedAmount = totals.excluded.sum;

  const normalizedDeclared = declaredDocumentAmount != null && Number.isFinite(declaredDocumentAmount)
    ? declaredDocumentAmount
    : null;
  const sourceVsDeclaredDifference = normalizedDeclared != null && sourceAmount.complete
    ? sourceAmount.knownAmount - normalizedDeclared
    : null;
  const sourceVsDeclaredPercent = sourceVsDeclaredDifference != null && normalizedDeclared != null && normalizedDeclared !== 0
    ? (sourceVsDeclaredDifference / Math.abs(normalizedDeclared)) * 100
    : null;
  const completeExcluded = amountWhenComplete(excludedAmount);
  const sourceTotal = amountWhenComplete(sourceAmount);
  // Do not infer a remainder from a declared footer if any source leaf amount is unknown:
  // the file could contain an unallocated/malformed row. Keep the footer visible, but fail closed.
  const eligibleDocumentAmount = sourceAmount.complete && normalizedDeclared != null && completeExcluded != null
    ? normalizedDeclared - completeExcluded
    : normalizedDeclared == null && sourceTotal != null && completeExcluded != null
      ? sourceTotal - completeExcluded
      : null;
  const confirmedTotal = amountWhenComplete(confirmedAmount);
  const notYetConfirmedAmount = eligibleDocumentAmount != null && confirmedTotal != null
    ? eligibleDocumentAmount - confirmedTotal
    : null;
  const notYetConfirmedPercent = notYetConfirmedAmount != null && eligibleDocumentAmount != null && eligibleDocumentAmount !== 0
    ? (notYetConfirmedAmount / Math.abs(eligibleDocumentAmount)) * 100
    : null;
  const confirmedCoveragePercent = eligibleDocumentAmount != null && eligibleDocumentAmount > 0 && confirmedTotal != null
    ? (confirmedTotal / eligibleDocumentAmount) * 100
    : null;

  const comparableReferenceAmount: AmountSum = {
    knownAmount: referenceKnownAmount,
    unknownCount: referenceUnknownCount,
    complete: referenceUnknownCount === 0 && confirmedLineCount > 0,
  };
  const f2VsReferenceDifference = confirmedTotal != null && comparableReferenceAmount.complete
    ? confirmedTotal - comparableReferenceAmount.knownAmount
    : null;
  const f2VsReferencePercent = f2VsReferenceDifference != null
    && comparableReferenceAmount.knownAmount !== 0
    ? (f2VsReferenceDifference / Math.abs(comparableReferenceAmount.knownAmount)) * 100
    : null;

  return {
    sourceLineCount: lines.length,
    sourceAmount,
    declaredDocumentAmount: normalizedDeclared,
    sourceVsDeclaredDifference,
    sourceVsDeclaredPercent,
    confirmedAmount,
    suggestedAmount,
    unboundAmount,
    excludedAmount,
    eligibleDocumentAmount,
    notYetConfirmedAmount,
    notYetConfirmedPercent,
    confirmedCoveragePercent,
    comparableReferenceAmount,
    f2VsReferenceDifference,
    f2VsReferencePercent,
  };
}
