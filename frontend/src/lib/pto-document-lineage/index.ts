/**
 * PTO hujjat lineage'i uchun bitta, deterministik va fail-closed validator.
 *
 * Bu modul yangi DB truth yaratmaydi. U mavjud canonical ID'larni bir paketga
 * yig'adi va chiquvchi F2/F3 hujjati bir xil company → project → object →
 * contract → period doirasidan chiqib ketmasligini tekshiradi.
 *
 * Muhim: nom, fayl nomi, sheet nomi yoki qatordagi tartib identity emas.
 */

export type CanonicalId = number;

export type PtoLineageScope = {
  companyId: CanonicalId;
  projectId: CanonicalId;
  objectId: CanonicalId;
  contractId: CanonicalId;
  periodId: string;
  revisionId?: string | null;
};

export type PtoHierarchyEvidence = {
  companyId: CanonicalId;
  projectId: CanonicalId;
  objectId: CanonicalId;
  contractId: CanonicalId;
  /** DB read modeldan kelgan parent/company dalillari. */
  projectCompanyId?: CanonicalId | null;
  objectCompanyId?: CanonicalId | null;
  objectProjectId?: CanonicalId | null;
  contractCompanyId?: CanonicalId | null;
  contractProjectId?: CanonicalId | null;
  /** t2_shartnoma_bog dan kelgan explicit object ↔ contract bog'lanishi. */
  linkedContractIds?: readonly CanonicalId[];
};

export type PtoLineageErrorCode =
  | 'LINEAGE_SCOPE_REQUIRED'
  | 'INVALID_CANONICAL_ID'
  | 'INVALID_PERIOD'
  | 'COMPANY_PROJECT_MISMATCH'
  | 'COMPANY_OBJECT_MISMATCH'
  | 'OBJECT_PROJECT_MISMATCH'
  | 'COMPANY_CONTRACT_MISMATCH'
  | 'CONTRACT_PROJECT_MISMATCH'
  | 'OBJECT_CONTRACT_UNLINKED'
  | 'F3_PERIOD_MISMATCH'
  | 'F3_SOURCE_NOT_APPROVED'
  | 'F3_SOURCE_SCOPE_MISMATCH'
  | 'F3_SOURCE_ROW_DUPLICATE'
  | 'F3_SOURCE_REQUIRED';

export type PtoLineageIssue = {
  code: PtoLineageErrorCode;
  field: string;
  message: string;
  expected?: unknown;
  actual?: unknown;
};

export type PtoLineageValidation = {
  ok: boolean;
  issues: readonly PtoLineageIssue[];
};

const issue = (
  code: PtoLineageErrorCode,
  field: string,
  message: string,
  expected?: unknown,
  actual?: unknown,
): PtoLineageIssue => ({ code, field, message, expected, actual });

const validId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

const idIssue = (field: string, value: unknown): PtoLineageIssue =>
  issue('INVALID_CANONICAL_ID', field, `${field} canonical ID musbat butun son bo'lishi kerak.`, 'positive integer', value);

const same = (a: unknown, b: unknown): boolean => a === b;

/** Minimal majburiy scope. F3 va rasmiy export undan kengroq qoidani ishlatadi. */
export function validatePtoLineageScope(scope: Partial<PtoLineageScope> | null | undefined): PtoLineageValidation {
  const issues: PtoLineageIssue[] = [];
  if (!scope) {
    return { ok: false, issues: [issue('LINEAGE_SCOPE_REQUIRED', 'scope', 'Hujjat lineage scope topilmadi; export bloklandi.')] };
  }
  for (const field of ['companyId', 'projectId', 'objectId', 'contractId'] as const) {
    if (!validId(scope[field])) issues.push(idIssue(field, scope[field]));
  }
  if (typeof scope.periodId !== 'string' || !/^\d{4}-\d{2}$/.test(scope.periodId)) {
    issues.push(issue('INVALID_PERIOD', 'periodId', "Hujjat davri YYYY-MM ko'rinishida bo'lishi kerak.", 'YYYY-MM', scope.periodId));
  }
  return { ok: issues.length === 0, issues };
}

/**
 * Project/object/contract parentlari bo'yicha faqat mavjud dalilni tekshiradi.
 * Dalil berilmagan joyda taxmin qilmaydi; F3 uchun bunday noma'lumlik keyingi
 * strict validatorda majburiy ravishda bloklanadi.
 */
export function validatePtoHierarchy(evidence: PtoHierarchyEvidence): PtoLineageValidation {
  const issues: PtoLineageIssue[] = [];
  const scopeResult = validatePtoLineageScope({ ...evidence, periodId: '2000-01' });
  for (const x of scopeResult.issues) {
    if (x.code !== 'INVALID_PERIOD') issues.push(x);
  }
  if (evidence.projectCompanyId != null && !same(evidence.projectCompanyId, evidence.companyId)) {
    issues.push(issue('COMPANY_PROJECT_MISMATCH', 'project.companyId', 'Loyiha boshqa kompaniyaga tegishli.', evidence.companyId, evidence.projectCompanyId));
  }
  if (evidence.objectCompanyId != null && !same(evidence.objectCompanyId, evidence.companyId)) {
    issues.push(issue('COMPANY_OBJECT_MISMATCH', 'object.companyId', 'Obyekt boshqa kompaniyaga tegishli.', evidence.companyId, evidence.objectCompanyId));
  }
  if (evidence.objectProjectId != null && !same(evidence.objectProjectId, evidence.projectId)) {
    issues.push(issue('OBJECT_PROJECT_MISMATCH', 'object.projectId', 'Obyekt tanlangan loyihaga tegishli emas.', evidence.projectId, evidence.objectProjectId));
  }
  if (evidence.contractCompanyId != null && !same(evidence.contractCompanyId, evidence.companyId)) {
    issues.push(issue('COMPANY_CONTRACT_MISMATCH', 'contract.companyId', 'Shartnoma boshqa kompaniyaga tegishli.', evidence.companyId, evidence.contractCompanyId));
  }
  if (evidence.contractProjectId != null && !same(evidence.contractProjectId, evidence.projectId)) {
    issues.push(issue('CONTRACT_PROJECT_MISMATCH', 'contract.projectId', 'Shartnoma tanlangan loyihaga tegishli emas.', evidence.projectId, evidence.contractProjectId));
  }
  if (evidence.linkedContractIds && !evidence.linkedContractIds.some((id) => same(id, evidence.contractId))) {
    issues.push(issue('OBJECT_CONTRACT_UNLINKED', 'object.contractId', 'Obyekt tanlangan shartnoma bilan explicit bog\'lanmagan.', evidence.contractId, evidence.linkedContractIds));
  }
  return { ok: issues.length === 0, issues };
}

export type PtoF3Source = {
  documentId: string;
  scope: PtoLineageScope;
  approved: boolean;
  qatorIds: readonly CanonicalId[];
};

export type PtoF3LineageInput = {
  scope: PtoLineageScope;
  sources: readonly PtoF3Source[];
};

/** F3 faqat bitta scope'dagi tasdiqlangan F2 manbalaridan tuziladi. */
export function validateF3Lineage(input: PtoF3LineageInput | null | undefined): PtoLineageValidation {
  const issues: PtoLineageIssue[] = [];
  const scope = input?.scope;
  const scopeResult = validatePtoLineageScope(scope);
  issues.push(...scopeResult.issues);
  if (!input || !scope || !scopeResult.ok) return { ok: false, issues };
  if (!input.sources.length) {
    issues.push(issue('F3_SOURCE_REQUIRED', 'sources', 'F3 uchun kamida bitta tasdiqlangan F2 manbasi kerak.'));
    return { ok: false, issues };
  }
  const seenRows = new Set<string>();
  for (const source of input.sources) {
    if (!source.documentId.trim()) {
      issues.push(issue('F3_SOURCE_REQUIRED', 'sources.documentId', 'F2 manbasi canonical document ID bilan kelishi kerak.'));
    }
    const sourceScope = validatePtoLineageScope(source.scope);
    issues.push(...sourceScope.issues);
    if (!source.approved) {
      issues.push(issue('F3_SOURCE_NOT_APPROVED', `sources.${source.documentId}.approved`, 'Tasdiqlanmagan F2 F3 ga kiritilmaydi.', true, source.approved));
    }
    if (!same(source.scope.companyId, scope.companyId)
      || !same(source.scope.projectId, scope.projectId)
      || !same(source.scope.objectId, scope.objectId)
      || !same(source.scope.contractId, scope.contractId)) {
      issues.push(issue('F3_SOURCE_SCOPE_MISMATCH', `sources.${source.documentId}.scope`, 'F2 manbasi F3 company/project/object/contract scope iga mos emas.', scope, source.scope));
    }
    // F3 cumulative ustunlari oldingi tasdiqlangan F2 davrlarini ham oladi.
    // Faqat kelajak davrdagi F2 yoki noto'g'ri period format bloklanadi.
    if (source.scope.periodId > scope.periodId) {
      issues.push(issue('F3_PERIOD_MISMATCH', `sources.${source.documentId}.periodId`, 'F2 manbasi F3 hisobot davridan keyingi davrga tegishli.', `<=${scope.periodId}`, source.scope.periodId));
    }
    for (const rowId of source.qatorIds) {
      if (!validId(rowId)) {
        issues.push(idIssue(`sources.${source.documentId}.qatorIds`, rowId));
        continue;
      }
      const key = `${source.scope.objectId}:${source.scope.periodId}:${rowId}`;
      if (seenRows.has(key)) issues.push(issue('F3_SOURCE_ROW_DUPLICATE', `sources.${source.documentId}.qatorIds`, 'Bir canonical qator F3 manbalarida ikki marta takrorlangan.', key, key));
      seenRows.add(key);
    }
  }
  return { ok: issues.length === 0, issues };
}

export class PtoLineageError extends Error {
  readonly code: PtoLineageErrorCode;
  readonly issues: readonly PtoLineageIssue[];

  constructor(issues: readonly PtoLineageIssue[]) {
    super(issues[0]?.message ?? 'PTO hujjat lineage tekshiruvi muvaffaqiyatsiz tugadi.');
    this.name = 'PtoLineageError';
    this.code = issues[0]?.code ?? 'LINEAGE_SCOPE_REQUIRED';
    this.issues = issues;
  }
}

export function assertF3Lineage(input: PtoF3LineageInput): void {
  const result = validateF3Lineage(input);
  if (!result.ok) throw new PtoLineageError(result.issues);
}
