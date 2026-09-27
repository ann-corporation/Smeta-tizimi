/**
 * PTO qatori uchun nomi aniq bo'lgan hisob-kitob projection layer.
 * Bu yangi business truth emas: canonical backend read-modelini turli
 * ekranlarda bir xil ma'noda ko'rsatadi. NULL hech qachon 0 ga aylantirilmaydi.
 */
export type PtoLedgerNumber = number | null;

export type PtoLedgerInput = {
  lineId: number;
  baselineQuantity: PtoLedgerNumber;
  baselineUnitPrice: PtoLedgerNumber;
  baselineAmount: PtoLedgerNumber;
  factQuantity: PtoLedgerNumber;
  factAmount: PtoLedgerNumber;
  previousApprovedQuantity: PtoLedgerNumber;
  previousApprovedAmount: PtoLedgerNumber;
  currentApprovedQuantity: PtoLedgerNumber;
  currentApprovedAmount: PtoLedgerNumber;
  approvedF2Quantity: PtoLedgerNumber;
  approvedF2Amount: PtoLedgerNumber;
  approvedChangeQuantity?: PtoLedgerNumber;
  approvedChangeAmount?: PtoLedgerNumber;
  actualUnitPrice?: PtoLedgerNumber;
  actualAmount?: PtoLedgerNumber;
};

export type PtoLedgerIssueCode =
  | 'OVER_CERTIFIED'
  | 'CUMULATIVE_QUANTITY_MISMATCH'
  | 'CUMULATIVE_AMOUNT_MISMATCH'
  | 'BASELINE_QUANTITY_UNKNOWN'
  | 'BASELINE_AMOUNT_UNKNOWN'
  | 'FACT_AMOUNT_UNKNOWN'
  | 'APPROVED_F2_AMOUNT_UNKNOWN';

export type PtoLineLedger = PtoLedgerInput & {
  approvedEntitlementQuantity: PtoLedgerNumber;
  approvedEntitlementAmount: PtoLedgerNumber;
  /** Baseline minus effective Fakt. */
  smetaRemainingQuantity: PtoLedgerNumber;
  smetaRemainingAmount: PtoLedgerNumber;
  /** Effective Fakt minus approved F2. */
  f2AvailableQuantity: PtoLedgerNumber;
  f2AvailableAmount: PtoLedgerNumber;
  /** Baseline/approved entitlement minus approved F2. */
  contractualRemainingQuantity: PtoLedgerNumber;
  contractualRemainingAmount: PtoLedgerNumber;
  cumulativeQuantity: PtoLedgerNumber;
  cumulativeAmount: PtoLedgerNumber;
  overCertified: boolean;
  issues: readonly PtoLedgerIssueCode[];
};

function add(a: PtoLedgerNumber, b: PtoLedgerNumber): PtoLedgerNumber {
  return a == null || b == null ? null : a + b;
}

function subtract(a: PtoLedgerNumber, b: PtoLedgerNumber): PtoLedgerNumber {
  return a == null || b == null ? null : a - b;
}

function closeEnough(a: PtoLedgerNumber, b: PtoLedgerNumber): boolean {
  return a != null && b != null && Math.abs(a - b) <= 0.005;
}

/** Canonical PTO semantikasi: to'rtta turli qoldiq bitta nomga aralashmaydi. */
export function buildPtoLineLedger(input: PtoLedgerInput): PtoLineLedger {
  const approvedEntitlementQuantity = add(input.baselineQuantity, input.approvedChangeQuantity ?? 0);
  const approvedEntitlementAmount = add(input.baselineAmount, input.approvedChangeAmount ?? 0);
  const smetaRemainingQuantity = subtract(input.baselineQuantity, input.factQuantity);
  const smetaRemainingAmount = subtract(input.baselineAmount, input.factAmount);
  const f2AvailableQuantity = subtract(input.factQuantity, input.approvedF2Quantity);
  const f2AvailableAmount = subtract(input.factAmount, input.approvedF2Amount);
  const contractualRemainingQuantity = subtract(approvedEntitlementQuantity, input.approvedF2Quantity);
  const contractualRemainingAmount = subtract(approvedEntitlementAmount, input.approvedF2Amount);
  const issues: PtoLedgerIssueCode[] = [];

  if (input.baselineQuantity == null) issues.push('BASELINE_QUANTITY_UNKNOWN');
  if (input.baselineAmount == null) issues.push('BASELINE_AMOUNT_UNKNOWN');
  if (input.factAmount == null) issues.push('FACT_AMOUNT_UNKNOWN');
  if (input.approvedF2Amount == null) issues.push('APPROVED_F2_AMOUNT_UNKNOWN');
  if (f2AvailableQuantity != null && f2AvailableQuantity < -0.000001) issues.push('OVER_CERTIFIED');
  if (input.previousApprovedQuantity != null && input.currentApprovedQuantity != null
      && !closeEnough(add(input.previousApprovedQuantity, input.currentApprovedQuantity), input.approvedF2Quantity)) {
    issues.push('CUMULATIVE_QUANTITY_MISMATCH');
  }
  if (input.previousApprovedAmount != null && input.currentApprovedAmount != null
      && !closeEnough(add(input.previousApprovedAmount, input.currentApprovedAmount), input.approvedF2Amount)) {
    issues.push('CUMULATIVE_AMOUNT_MISMATCH');
  }

  return {
    ...input,
    approvedEntitlementQuantity,
    approvedEntitlementAmount,
    smetaRemainingQuantity,
    smetaRemainingAmount,
    f2AvailableQuantity,
    f2AvailableAmount,
    contractualRemainingQuantity,
    contractualRemainingAmount,
    cumulativeQuantity: input.approvedF2Quantity,
    cumulativeAmount: input.approvedF2Amount,
    overCertified: issues.includes('OVER_CERTIFIED'),
    issues,
  };
}

export type PtoLedgerTotals = {
  lineCount: number;
  baselineQuantity: PtoLedgerNumber;
  baselineAmount: PtoLedgerNumber;
  factQuantity: PtoLedgerNumber;
  factAmount: PtoLedgerNumber;
  approvedF2Quantity: PtoLedgerNumber;
  approvedF2Amount: PtoLedgerNumber;
  smetaRemainingQuantity: PtoLedgerNumber;
  smetaRemainingAmount: PtoLedgerNumber;
  f2AvailableQuantity: PtoLedgerNumber;
  f2AvailableAmount: PtoLedgerNumber;
  contractualRemainingQuantity: PtoLedgerNumber;
  contractualRemainingAmount: PtoLedgerNumber;
  issueCount: number;
  overCertifiedCount: number;
};

function sum(values: readonly PtoLedgerNumber[]): PtoLedgerNumber {
  if (values.some((value) => value == null)) return null;
  let total = 0;
  for (const value of values) total += value as number;
  return total;
}

export function summarizePtoLedger(lines: readonly PtoLineLedger[]): PtoLedgerTotals {
  return {
    lineCount: lines.length,
    baselineQuantity: sum(lines.map((line) => line.baselineQuantity)),
    baselineAmount: sum(lines.map((line) => line.baselineAmount)),
    factQuantity: sum(lines.map((line) => line.factQuantity)),
    factAmount: sum(lines.map((line) => line.factAmount)),
    approvedF2Quantity: sum(lines.map((line) => line.approvedF2Quantity)),
    approvedF2Amount: sum(lines.map((line) => line.approvedF2Amount)),
    smetaRemainingQuantity: sum(lines.map((line) => line.smetaRemainingQuantity)),
    smetaRemainingAmount: sum(lines.map((line) => line.smetaRemainingAmount)),
    f2AvailableQuantity: sum(lines.map((line) => line.f2AvailableQuantity)),
    f2AvailableAmount: sum(lines.map((line) => line.f2AvailableAmount)),
    contractualRemainingQuantity: sum(lines.map((line) => line.contractualRemainingQuantity)),
    contractualRemainingAmount: sum(lines.map((line) => line.contractualRemainingAmount)),
    issueCount: lines.reduce((count, line) => count + line.issues.length, 0),
    overCertifiedCount: lines.filter((line) => line.overCertified).length,
  };
}
