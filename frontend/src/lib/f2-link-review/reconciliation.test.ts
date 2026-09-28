import { describe, expect, it } from 'vitest';
import { reconcileF2Links, type F2MoneyLine } from './reconciliation';

const line = (state: F2MoneyLine['state'], amount: number | null, quantity = 1, price: number | null = 100): F2MoneyLine => ({
  state, sourceAmount: amount, sourceQuantity: quantity, referenceUnitPrice: price,
});

describe('F2 link amount reconciliation', () => {
  it('separates confirmed, suggested, unresolved and intentionally excluded source amounts', () => {
    const result = reconcileF2Links(1_000, [
      line('confirmed', 600, 6), line('suggested', 250, 2.5), line('unbound', 100), line('excluded', 50),
    ]);
    expect(result.sourceAmount).toEqual({ knownAmount: 1_000, unknownCount: 0, complete: true });
    expect(result.confirmedAmount.knownAmount).toBe(600);
    expect(result.suggestedAmount.knownAmount).toBe(250);
    expect(result.unboundAmount.knownAmount).toBe(100);
    expect(result.excludedAmount.knownAmount).toBe(50);
    expect(result.eligibleDocumentAmount).toBe(950);
    expect(result.notYetConfirmedAmount).toBe(350);
    expect(result.notYetConfirmedPercent).toBeCloseTo(350 / 950 * 100);
    expect(result.confirmedCoveragePercent).toBeCloseTo(600 / 950 * 100);
    expect(result.sourceVsDeclaredPercent).toBe(0);
  });

  it('does not treat a missing source amount as zero or claim a total reconciliation', () => {
    const result = reconcileF2Links(500, [line('confirmed', 400), line('unbound', null)]);
    expect(result.sourceAmount.knownAmount).toBe(400);
    expect(result.sourceAmount.unknownCount).toBe(1);
    expect(result.sourceVsDeclaredDifference).toBeNull();
    expect(result.sourceVsDeclaredPercent).toBeNull();
    expect(result.eligibleDocumentAmount).toBeNull();
    expect(result.unboundAmount.complete).toBe(false);
    expect(result.notYetConfirmedAmount).toBeNull();
  });

  it('keeps the F2 source amount exact and compares estimate reference value separately', () => {
    const source = line('confirmed', 1_025, 10, 100);
    const result = reconcileF2Links(1_025, [source]);
    expect(result.confirmedAmount.knownAmount).toBe(1_025);
    expect(result.comparableReferenceAmount.knownAmount).toBe(1_000);
    expect(result.f2VsReferenceDifference).toBe(25);
    expect(result.f2VsReferencePercent).toBe(2.5);
    expect(source.sourceAmount).toBe(1_025);
  });

  it('returns NULL percentages for zero denominator instead of fake 0%', () => {
    const result = reconcileF2Links(0, [line('confirmed', 0, 0, 0)]);
    expect(result.confirmedCoveragePercent).toBeNull();
    expect(result.f2VsReferencePercent).toBeNull();
  });

  it('does not manufacture a zero reference-price comparison before any row is confirmed', () => {
    const result = reconcileF2Links(300, [line('suggested', 300)]);
    expect(result.comparableReferenceAmount.complete).toBe(false);
    expect(result.f2VsReferenceDifference).toBeNull();
  });

  it('sums large sets of decimal source amounts without visible binary-float drift', () => {
    const lines = Array.from({ length: 50_000 }, (_, index) => line(index % 2 ? 'confirmed' : 'unbound', 0.1));
    const result = reconcileF2Links(null, lines);
    expect(result.sourceAmount.knownAmount).toBeCloseTo(5_000, 8);
    expect(result.confirmedAmount.knownAmount).toBeCloseTo(2_500, 8);
  });

  it('does not report a full reference comparison if one mapped line lacks price evidence', () => {
    const result = reconcileF2Links(300, [line('confirmed', 100, 1), line('confirmed', 200, 2, null)]);
    expect(result.comparableReferenceAmount.knownAmount).toBe(100);
    expect(result.comparableReferenceAmount.unknownCount).toBe(1);
    expect(result.f2VsReferenceDifference).toBeNull();
    expect(result.f2VsReferencePercent).toBeNull();
  });
});
