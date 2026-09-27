import { describe, expect, it } from 'vitest';
import { calculateProgressValuation, createExportPreview } from '.';
import { documentFidelityFixture } from './fixtures/document-fidelity';
import type { ApprovedChange, CertifiedLine, ProgressLine } from './types';

const clone = <T,>(value: T): T => structuredClone(value);
const calc = (mutate: (model: typeof documentFidelityFixture) => void) => {
  const model = clone(documentFidelityFixture); mutate(model); return calculateProgressValuation(model.valuation);
};
const row = (result: ReturnType<typeof calculateProgressValuation>, id: string) => result.rows.find(x => x.lineId === id)!;

describe('pre-main adversarial document-control contract', () => {
  it('uses the frozen source amount even when quantity × price differs', () => {
    const result = calc(model => {
      const current = (model.valuation.periods[1].lines as CertifiedLine[]).find(x => x.lineId === 'bl-original')!;
      current.certifiedAmount = 2_999_999.99;
    });
    const original = row(result, 'bl-original');
    expect(original.currentCertifiedValue).toBe(2_999_999.99);
    expect(original.f2ValuationValue).toBe(6_999_999.99);
    expect(original.currentF2ValuationPrice).toBe(100_000);
    expect(original.warnings).toContain('PRICE_VARIANCE');
  });

  it('does not fabricate an F2 amount when the source amount is absent', () => {
    const result = calc(model => {
      delete (model.valuation.periods[1].lines as CertifiedLine[]).find(x => x.lineId === 'bl-original')!.certifiedAmount;
    });
    const original = row(result, 'bl-original');
    expect(original.currentCertifiedValue).toBeNull();
    expect(original.f2ValuationValue).toBeNull();
    expect(original.warnings).toContain('MISSING_CERTIFIED_AMOUNT');
  });

  it('keeps zero, fractional, high-precision and negative certified corrections on the F2 valuation basis', () => {
    const result = calc(model => {
      (model.valuation.periods[1].lines as CertifiedLine[]).push(
        { lineId: 'finish', quantity: 0, certifiedAmount: 0, f2ValuationPrice: 150_000, referencePriceSourceId: 'rev-base' },
        { lineId: 'finish', quantity: 0.333333, certifiedAmount: 50.19, f2ValuationPrice: 150.5555, referencePriceSourceId: 'rev-base' },
        { lineId: 'finish', quantity: -0.1, certifiedAmount: -15.06, f2ValuationPrice: 150.5555, referencePriceSourceId: 'rev-base' },
      );
    });
    const finish = row(result, 'finish');
    expect(finish.currentQuantity).toBe(0.233333);
    expect(finish.currentCertifiedValue).toBe(35.13);
    expect(finish.currentF2ValuationPrice).toBeNull(); // multiple certified prices cannot be silently collapsed
  });

  it('fails visibly on over-certification while retaining certified history and the baseline price', () => {
    const result = calc(model => { (model.valuation.periods[1].lines as CertifiedLine[]).push({ lineId: 'remove', quantity: 1, certifiedAmount: 50_000, f2ValuationPrice: 50_000, referencePriceSourceId: 'rev-base' }); });
    const removed = row(result, 'remove');
    expect(removed.approvedEntitlementQuantity).toBe(0);
    expect(removed.cumulativeQuantity).toBe(1);
    expect(removed.warnings).toContain('OVER_CERTIFICATION');
    expect(removed.baselineReferencePrice).toBe(50_000);
  });

  it('never lets actual or contractual/change price overwrite frozen F2 or baseline facts', () => {
    const result = calc(model => {
      (model.valuation.changes as ApprovedChange[]).push({ changeId: 'contract-price', kind: 'quantity_increase', status: 'approved', lineId: 'bl-original', revisionId: 'rev-contract', effectivePeriodIndex: 1, quantityDelta: 1, valuationPrice: 777_777, reason: 'approved contractual price', evidenceIds: ['e'] });
      model.valuation.periods[1].lines[0].actualProcurementPrice = 1;
    });
    const original = row(result, 'bl-original');
    expect(original.baselineReferencePrice).toBe(100_000);
    expect(original.currentF2ValuationPrice).toBe(100_000);
    expect(original.actualValue).toBe(4_400_030);
    expect(original.warnings).toContain('PRICE_VARIANCE');
  });

  it('keeps pending/rejected/reverted changes out of approved entitlement exactly once', () => {
    const result = calc(model => {
      (model.valuation.changes as ApprovedChange[]).push(
        { changeId: 'pending-extra', kind: 'additional_work', status: 'pending', lineId: 'additional', revisionId: 'rp', effectivePeriodIndex: 1, quantityDelta: 50, reason: 'pending', evidenceIds: [] },
        { changeId: 'rejected-extra', kind: 'additional_work', status: 'rejected', lineId: 'additional', revisionId: 'rr', effectivePeriodIndex: 1, quantityDelta: 50, reason: 'rejected', evidenceIds: [] },
      );
    });
    expect(row(result, 'additional').approvedEntitlementQuantity).toBe(15);
    expect(row(result, 'additional').approvedChangeQuantity).toBe(15);
  });

  it('keeps unknown actual prices null and historical approved F2 immutable after later baseline edits', () => {
    const before = clone(documentFidelityFixture);
    const result = calc(model => {
      model.valuation.lines[0].baselineReferencePrice = 999_999;
      delete model.valuation.periods[1].lines[2].actualProcurementPrice;
    });
    expect(row(result, 'bl-original').previousCertifiedValue).toBe(4_000_000);
    expect(row(result, 'additional').actualValue).toBeNull();
    expect(documentFidelityFixture).toEqual(before);
  });

  it('preserves identity across filter/reorder and excludes all hidden metadata from official export', () => {
    const model = clone(documentFidelityFixture);
    (model.valuation as unknown as { lines: ProgressLine[] }).lines = model.valuation.lines.filter(line => line.sectionId === 'section-1').reverse();
    const result = calculateProgressValuation(model.valuation);
    expect(row(result, 'rs-cement').parentLineId).toBe('bl-original');
    const exportPreview = createExportPreview(model);
    expect(exportPreview.officialRows).toHaveLength(7);
    expect(exportPreview.officialRows.every(item => !Object.keys(item).some(key => ['lineId', 'parentLineId', 'changeKinds', 'revisionIds'].includes(key)))).toBe(true);
    expect(exportPreview.officialRows.map(item => item.description).join('|')).not.toMatch(/ZAMENA|QO'SHIMCHA|REPLACEMENT|CHANGE|REVISION BANNER/i);
  });
});
