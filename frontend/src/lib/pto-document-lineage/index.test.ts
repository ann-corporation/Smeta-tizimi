import { describe, expect, it } from 'vitest';
import {
  assertF3Lineage,
  validateF3Lineage,
  validatePtoHierarchy,
  validatePtoLineageScope,
  type PtoLineageScope,
} from './index';

const scope: PtoLineageScope = {
  companyId: 7,
  projectId: 11,
  objectId: 73,
  contractId: 91,
  periodId: '2026-09',
};

const approved = (documentId: string, patch: Partial<typeof scope> = {}) => ({
  documentId, scope: { ...scope, ...patch }, approved: true, qatorIds: [101, 102],
});

describe('PTO canonical document lineage', () => {
  it('scope bo‘lmasa yoki ID noto‘g‘ri bo‘lsa fail-closed qiladi', () => {
    expect(validatePtoLineageScope(undefined).ok).toBe(false);
    const r = validatePtoLineageScope({ ...scope, objectId: 0 });
    expect(r.ok).toBe(false);
    expect(r.issues.map((x) => x.code)).toContain('INVALID_CANONICAL_ID');
  });

  it('project/object/company parent nomuvofiqligini topadi', () => {
    const r = validatePtoHierarchy({
      ...scope,
      objectProjectId: 12,
      projectCompanyId: 8,
      objectCompanyId: 7,
      contractCompanyId: 7,
      contractProjectId: 11,
      linkedContractIds: [91],
    });
    expect(r.ok).toBe(false);
    expect(r.issues.map((x) => x.code)).toEqual(expect.arrayContaining([
      'COMPANY_PROJECT_MISMATCH', 'OBJECT_PROJECT_MISMATCH',
    ]));
  });

  it('unknown contract projectni taxmin qilmaydi', () => {
    const r = validatePtoHierarchy({
      ...scope,
      projectCompanyId: 7,
      objectCompanyId: 7,
      objectProjectId: 11,
      contractCompanyId: 7,
      contractProjectId: null,
      linkedContractIds: [91],
    });
    expect(r.ok).toBe(false);
    expect(r.issues.map((x) => x.code)).toContain('CONTRACT_PROJECT_MISMATCH');
  });

  it('F3 uchun bir xil scope va tasdiqlangan F2 PASS', () => {
    expect(validateF3Lineage({ scope, sources: [approved('f2-1')] }).ok).toBe(true);
  });

  it('boshqa loyiha/obyekt/shartnoma F2 manbasini aralashtirishni bloklaydi', () => {
    const r = validateF3Lineage({ scope, sources: [approved('f2-1', { projectId: 12 }), approved('f2-2', { contractId: 92 })] });
    expect(r.ok).toBe(false);
    expect(r.issues.map((x) => x.code)).toEqual(expect.arrayContaining(['F3_SOURCE_SCOPE_MISMATCH']));
  });

  it('tasdiqlanmagan F2 F3 ga kirmaydi', () => {
    const r = validateF3Lineage({ scope, sources: [{ ...approved('draft'), approved: false }] });
    expect(r.ok).toBe(false);
    expect(r.issues.map((x) => x.code)).toContain('F3_SOURCE_NOT_APPROVED');
  });

  it('davr mos kelmasa bloklaydi', () => {
    const r = validateF3Lineage({ scope, sources: [approved('f2-future', { periodId: '2026-10' })] });
    expect(r.ok).toBe(false);
    expect(r.issues.map((x) => x.code)).toContain('F3_PERIOD_MISMATCH');
  });

  it('F3 cumulative uchun oldingi approved periodlar ruxsat, keyingi period blok', () => {
    expect(validateF3Lineage({ scope, sources: [approved('f2-old', { periodId: '2026-08' })] }).ok).toBe(true);
    expect(validateF3Lineage({ scope, sources: [approved('f2-future', { periodId: '2026-10' })] }).ok).toBe(false);
  });

  it('bir xil F2 manbasi va canonical qator qayta sanalsa bloklaydi', () => {
    const r = validateF3Lineage({ scope, sources: [approved('f2-1'), approved('f2-1')] });
    expect(r.ok).toBe(false);
    expect(r.issues.map((x) => x.code)).toContain('F3_SOURCE_ROW_DUPLICATE');
  });

  it('invalid source identity is rejected instead of becoming an anonymous F2 source', () => {
    const r = validateF3Lineage({
      scope,
      sources: [{ documentId: '', scope, approved: true, qatorIds: [0] }],
    });
    expect(r.ok).toBe(false);
    expect(r.issues.map((x) => x.code)).toEqual(expect.arrayContaining(['F3_SOURCE_REQUIRED', 'INVALID_CANONICAL_ID']));
  });

  it('assert helper xatoni texnik bo‘lmagan kod bilan qaytaradi', () => {
    expect(() => assertF3Lineage({ scope, sources: [{ ...approved('draft'), approved: false }] })).toThrow('Tasdiqlanmagan F2');
  });
});
