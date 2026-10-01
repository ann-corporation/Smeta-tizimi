import { describe, expect, it } from 'vitest';
import { buildPtoLineLedger, summarizePtoLedger, type PtoLedgerInput } from './ledger';

const input = (overrides: Partial<PtoLedgerInput> = {}): PtoLedgerInput => ({
  lineId: 7,
  baselineQuantity: 100,
  baselineUnitPrice: 10,
  baselineAmount: 1000,
  factQuantity: 60,
  factAmount: 720,
  previousApprovedQuantity: 20,
  previousApprovedAmount: 200,
  currentApprovedQuantity: 10,
  currentApprovedAmount: 120,
  approvedF2Quantity: 30,
  approvedF2Amount: 320,
  ...overrides,
});

describe('PTO canonical line ledger', () => {
  it('tasdiqlangan o‘zgarish noma’lum bo‘lsa entitlementni to‘qimaydi', () => {
    const line = buildPtoLineLedger(input({ approvedChangeQuantity: null, approvedChangeAmount: null }));
    expect(line.approvedEntitlementQuantity).toBeNull();
    expect(line.approvedEntitlementAmount).toBeNull();
    expect(line.contractualRemainingQuantity).toBeNull();
    expect(line.contractualRemainingAmount).toBeNull();
    expect(line.cumulativeAmount).toBe(320);
  });

  it('berilmagan va aniq nol o‘zgarish baseline tarixini saqlaydi', () => {
    for (const delta of [undefined, 0]) {
      const line = buildPtoLineLedger(input({ approvedChangeQuantity: delta, approvedChangeAmount: delta }));
      expect(line.approvedEntitlementQuantity).toBe(100);
      expect(line.approvedEntitlementAmount).toBe(1000);
    }
  });
  it('baseline, Fakt qoldig‘i, F2 mumkin va contractual qoldiqni aralashtirmaydi', () => {
    const line = buildPtoLineLedger(input());
    expect(line.smetaRemainingQuantity).toBe(40);
    expect(line.smetaRemainingAmount).toBe(280);
    expect(line.f2AvailableQuantity).toBe(30);
    expect(line.f2AvailableAmount).toBe(400);
    expect(line.contractualRemainingQuantity).toBe(70);
    expect(line.contractualRemainingAmount).toBe(680);
  });

  it('approved F2 amountni quantity*price bilan almashtirmaydi', () => {
    const line = buildPtoLineLedger(input({ approvedF2Quantity: 30, approvedF2Amount: 317.77 }));
    expect(line.cumulativeAmount).toBe(317.77);
    expect(line.f2AvailableAmount).toBe(402.23);
  });

  it('over-certificationni yashirmaydi', () => {
    const line = buildPtoLineLedger(input({ approvedF2Quantity: 70 }));
    expect(line.overCertified).toBe(true);
    expect(line.issues).toContain('OVER_CERTIFIED');
    expect(line.f2AvailableQuantity).toBe(-10);
  });

  it('previous + current cumulative bilan mos kelmasa exception beradi', () => {
    const line = buildPtoLineLedger(input({ approvedF2Quantity: 31, approvedF2Amount: 321 }));
    expect(line.issues).toContain('CUMULATIVE_QUANTITY_MISMATCH');
    expect(line.issues).toContain('CUMULATIVE_AMOUNT_MISMATCH');
  });

  it('NULL qiymatni nolga aylantirmaydi', () => {
    const line = buildPtoLineLedger(input({ baselineAmount: null, factAmount: null }));
    expect(line.smetaRemainingAmount).toBeNull();
    expect(line.f2AvailableAmount).toBeNull();
    expect(line.issues).toEqual(expect.arrayContaining(['BASELINE_AMOUNT_UNKNOWN', 'FACT_AMOUNT_UNKNOWN']));
  });

  it('summary nullni yashirmasdan qatorlar bo‘yicha jamlaydi', () => {
    const lines = [buildPtoLineLedger(input()), buildPtoLineLedger(input({ lineId: 8, baselineAmount: null }))];
    const totals = summarizePtoLedger(lines);
    expect(totals.lineCount).toBe(2);
    expect(totals.baselineQuantity).toBe(200);
    expect(totals.baselineAmount).toBeNull();
    expect(totals.overCertifiedCount).toBe(0);
  });
});
