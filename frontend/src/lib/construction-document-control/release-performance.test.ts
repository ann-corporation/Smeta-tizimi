import { describe, expect, it } from 'vitest';
import { calculateProgressValuation, createExportPreview } from '.';
import type { ConstructionDocumentControlReadModel, ProgressLine } from './types';

const makeModel = (count: number): ConstructionDocumentControlReadModel => {
  const lines: ProgressLine[] = Array.from({ length: count }, (_, i) => ({ lineId: `line-${i}`, sectionId: `section-${i % 40}`, description: `BOQ ${i}`, unit: 'm', baselineQuantity: 10, baselineReferencePrice: 123.456 }));
  return { projectId: 'p', objectId: 'o', projectName: 'P', objectName: 'O', requirements: [], documents: [], revisions: [], valuation: { projectId: 'p', objectId: 'o', estimateRevisionId: 'base', currency: 'UZS', throughPeriod: 1, lines, changes: [], periods: [
    { periodId: 'p0', label: 'P0', revisionId: 'r0', frozen: true, documentIds: [], lines: lines.map(line => ({ lineId: line.lineId, quantity: 1, certifiedAmount: 123.46, f2ValuationPrice: 123.456, referencePriceSourceId: 'base' })) },
    { periodId: 'p1', label: 'P1', revisionId: 'r1', frozen: true, documentIds: [], lines: lines.map(line => ({ lineId: line.lineId, quantity: 2, certifiedAmount: 246.91, f2ValuationPrice: 123.456, referencePriceSourceId: 'base' })) },
  ] } };
};
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

describe('release performance regression guard', () => {
  it('keeps calculation, projection and export shaping bounded at 10k and 50k rows', () => {
    const tenK = makeModel(10_000); const samples: number[] = [];
    for (let i = 0; i < 3; i++) { const start = performance.now(); const result = calculateProgressValuation(tenK.valuation); createExportPreview(tenK); samples.push(performance.now() - start); expect(result.rows).toHaveLength(10_000); }
    const fiftyK = makeModel(50_000); const start50 = performance.now(); const result50 = calculateProgressValuation(fiftyK.valuation); const preview50 = createExportPreview(fiftyK); const ms50 = performance.now() - start50;
    const median10 = median(samples); console.info(`RELEASE_QA_10K_MEDIAN_MS=${median10.toFixed(2)}`); console.info(`RELEASE_QA_50K_MS=${ms50.toFixed(2)}`);
    expect(result50.rows).toHaveLength(50_000); expect(preview50.officialRows).toHaveLength(50_000);
    expect(median10).toBeLessThan(6_000); expect(ms50).toBeLessThan(20_000);
    expect(ms50 / Math.max(median10, 1)).toBeLessThan(12); // generous linear-growth guard, not a microbenchmark
  }, 30_000);
});
