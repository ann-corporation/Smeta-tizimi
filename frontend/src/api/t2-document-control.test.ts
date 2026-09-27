import { describe, expect, it } from 'vitest';
import { calculateProgressValuation } from '../lib/construction-document-control';
import { normalizeWorkbench, progressValuationPage } from './t2-document-control';

/** A t2_workbench_v1 jsonb payload as Postgres emits it (nulls, not undefined;
 *  requirement type 'forma3', evidenceRule 'forma3_unresolved'). */
const raw = {
  ok: true,
  projectId: '4', objectId: '8', projectName: 'Park', objectName: 'Avtosalon',
  currentPeriodId: '2026-03',
  valuation: {
    projectId: '4', objectId: '8', estimateRevisionId: 'rev-11', currency: 'UZS', throughPeriod: 0,
    lines: [{ lineId: '1', sectionId: 'root', description: 'Beton', unit: 'm3', baselineQuantity: 10, baselineReferencePrice: 100 }],
    changes: [],
    periods: [{
      periodId: '2026-03', label: '2026-03', revisionId: 'rev-11', frozen: true, documentIds: ['akt-1'],
      lines: [
        { lineId: '1', quantity: 3, certifiedAmount: 361.23, f2ValuationPrice: 120, actualProcurementPrice: null, referencePriceSourceId: 'baseline-11', actualPriceSourceId: null },
      ],
    }],
  },
  requirements: [
    { requirementId: 'req-1', type: 'f2', label: 'F2', required: true, requiresApproved: true, evidenceRule: 'verified' },
    { requirementId: 'req-9', type: 'forma3', label: 'Forma-3', required: false, requiresApproved: false, evidenceRule: 'forma3_unresolved' },
  ],
  documents: [{ documentId: 'akt-1', objectId: '8', type: 'f2', status: 'approved', periodId: '2026-03', revisionId: 'rev-11' }],
  revisions: [{ revisionId: 'rev-1', kind: 'baseline', status: 'certified', occurredAt: '2026-01-01', reason: 'asl', evidenceIds: [], immutable: true }],
};

describe('t2-document-control adapter', () => {
  it('drops SQL nulls from optional CertifiedLine fields so "unknown" stays unknown', () => {
    const m = normalizeWorkbench(raw);
    const line = m.valuation.periods[0].lines[0] as unknown as Record<string, unknown>;
    expect('actualProcurementPrice' in line).toBe(false);
    expect('actualPriceSourceId' in line).toBe(false);
    expect(line.f2ValuationPrice).toBe(120);
    expect(line.certifiedAmount).toBe(361.23);
    const row = calculateProgressValuation(m.valuation).rows[0];
    expect(row.actualValue).toBeNull();      // not 0 — no actual price was certified
    expect(row.f2ValuationValue).toBe(361.23);  // exact certified_amount, not 3 × 120
  });

  it('maps SQL requirement/document vocabulary to the pure-engine contract', () => {
    const m = normalizeWorkbench(raw);
    expect(m.requirements.find(r => r.requirementId === 'req-9')).toMatchObject({ type: 'payment_certification', rule: 'payment_rule_unresolved' });
    expect(m.requirements.find(r => r.requirementId === 'req-1')).toMatchObject({ type: 'f2', rule: 'verified' });
  });

  it('builds a bounded deterministic page from the same calculation', () => {
    const m = normalizeWorkbench(raw);
    const page = progressValuationPage(m, { limit: 1 });
    expect(page.totalCount).toBe(1);
    expect(page.rows).toHaveLength(1);
    expect(page.rows[0].cumulativeQuantity).toBe(3);
  });

  it('returns a professional empty page when the object has no approved F2 period', () => {
    const noPeriods = structuredClone(raw) as any;
    noPeriods.currentPeriodId = null;
    noPeriods.valuation.periods = [];
    const model = normalizeWorkbench(noPeriods);
    const page = progressValuationPage(model, { limit: 50 });
    expect(page.rows).toEqual([]);
    expect(page.totalCount).toBe(0);
    expect(page.query.limit).toBe(50);
  });

  it('preserves missing baseline quantity/price as unknown instead of zero', () => {
    const missingBaseline = structuredClone(raw) as any;
    missingBaseline.valuation.lines[0].baselineQuantity = null;
    missingBaseline.valuation.lines[0].baselineReferencePrice = null;
    const model = normalizeWorkbench(missingBaseline);
    const result = calculateProgressValuation(model.valuation);
    const row = result.rows[0];
    expect(row.baselineQuantity).toBeNull();
    expect(row.baselineReferencePrice).toBeNull();
    expect(row.approvedEntitlementQuantity).toBeNull();
    expect(row.remainingQuantity).toBeNull();
    expect(row.previousValue).toBeNull();
    expect(row.currentValue).toBeNull();
    expect(row.cumulativeValue).toBeNull();
    expect(row.warnings).toEqual(expect.arrayContaining(['MISSING_BASELINE_QUANTITY', 'MISSING_BASELINE_PRICE']));
    expect(result.totals.remainingQuantity).toBeNull();
    expect(result.totals.cumulativeValue).toBeNull();
  });
});
