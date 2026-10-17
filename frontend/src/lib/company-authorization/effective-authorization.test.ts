import { describe, expect, it } from 'vitest';
import { authorize, canAccessObject, canAccessProject, companyChoice, effectiveAuthorization, hasCapability, type AuthorizationContext, type AuthorizationFacts } from './effective-authorization';

const ctx = (permission: AuthorizationContext['permission'], patch: Partial<AuthorizationContext> = {}): AuthorizationContext =>
  ({ actorId: 17, companyId: 10, projectId: 100, objectId: 1000, permission, ...patch });
const facts = (patch: Partial<AuthorizationFacts> = {}): AuthorizationFacts =>
  ({ platformRole: 'none', membershipRole: 'pto', projectScope: 'write', objectScope: 'write', targetScopeValid: true, ...patch });

describe('T2 Company Control effective authorization', () => {
  it('platform superadmin company PTO rolidan ustun', () => {
    expect(effectiveAuthorization(ctx('company.member.manage'), facts({ platformRole: 'superadmin', platformCompanyContext: true, membershipRole: 'pto' })).allowed).toBe(true);
  });
  it('boss o‘z kompaniyasining barcha loyihalarini boshqaradi', () => {
    expect(effectiveAuthorization(ctx('object.write'), facts({ membershipRole: 'boss', projectScope: 'none', objectScope: 'none' })).allowed).toBe(true);
  });
  it('boss boshqa kompaniya yoki global boshqaruvga o‘tmaydi', () => {
    expect(effectiveAuthorization(ctx('object.write'), facts({ membershipRole: 'boss', targetScopeValid: false })).allowed).toBe(false);
    expect(effectiveAuthorization(ctx('control.global.write', { companyId: null }), facts({ membershipRole: 'boss' })).allowed).toBe(false);
  });
  it('A=boss, B=pto: role company context bilan almashadi', () => {
    expect(effectiveAuthorization(ctx('company.profile.update'), facts({ membershipRole: 'boss' })).allowed).toBe(true);
    expect(effectiveAuthorization(ctx('company.profile.update'), facts({ membershipRole: 'pto' })).allowed).toBe(false);
  });
  it('A→B switch eski boss huquqini olib yurmaydi', () => {
    const a = effectiveAuthorization(ctx('control.company.write', { companyId: 1 }), facts({ membershipRole: 'boss' }));
    const b = effectiveAuthorization(ctx('control.company.write', { companyId: 2 }), facts({ membershipRole: 'pto' }));
    expect(a.allowed).toBe(true); expect(b.allowed).toBe(false);
  });
  it('forged company_id membership yo‘q bo‘lsa rad etiladi', () => {
    expect(effectiveAuthorization(ctx('company.read', { companyId: 999 }), facts({ membershipRole: null })).reason).toBe('COMPANY_MEMBERSHIP_REQUIRED');
  });
  it('revoked membership fail-closed', () => {
    expect(effectiveAuthorization(ctx('project.read'), facts({ membershipRole: null })).allowed).toBe(false);
  });
  it('role mid-session o‘zgarsa yangi DB roli bilan rad etadi', () => {
    expect(effectiveAuthorization(ctx('financial.write'), facts({ membershipRole: 'kuzatuvchi' })).allowed).toBe(false);
  });
  it('disabled capability role ruxsatidan ustun', () => {
    expect(effectiveAuthorization(ctx('document.write', { capability: 'document.write' }), facts({ capabilities: { 'document.write': false } })).reason).toBe('CAPABILITY_DISABLED');
  });
  it('project scope yo‘q bo‘lsa project rad etiladi', () => {
    expect(effectiveAuthorization(ctx('project.read', { objectId: null }), facts({ projectScope: 'none' })).reason).toBe('PROJECT_SCOPE_DENIED');
  });
  it('object scope ham, project scope ham yo‘q bo‘lsa object rad etiladi', () => {
    expect(effectiveAuthorization(ctx('object.write'), facts({ projectScope: 'none', objectScope: 'none' })).reason).toBe('OBJECT_SCOPE_DENIED');
  });
  it('direct URL UI emas, shu server qarori bilan rad etiladi', () => {
    expect(effectiveAuthorization(ctx('document.read'), facts({ membershipRole: null })).allowed).toBe(false);
  });
  it('stale session actorisiz rad etiladi', () => {
    expect(effectiveAuthorization(ctx('company.read', { actorId: null }), facts()).reason).toBe('AUTH_REQUIRED');
  });
  it('one-company user selector emas static badge oladi', () => {
    expect(companyChoice([10], 10, 'none')).toEqual({ kind: 'static', companyId: 10 });
  });
  it('multi-company user faqat membershiplari bilan selector oladi', () => {
    expect(companyChoice([10, 20], 20, 'none')).toEqual({ kind: 'selector', companyId: 20 });
  });
  it('platform superadmin global control yozuviga ega', () => {
    expect(effectiveAuthorization(ctx('control.global.write', { companyId: null }), facts({ platformRole: 'superadmin', membershipRole: null })).allowed).toBe(true);
    expect(effectiveAuthorization(ctx('control.global.write', { companyId: null }), facts({ membershipRole: 'boss' })).allowed).toBe(false);
  });
  it('platform superadmin company contexti explicit bo‘lmasa rad etiladi', () => {
    expect(effectiveAuthorization(ctx('company.read'), facts({ platformRole: 'superadmin', membershipRole: null, platformCompanyContext: false })).allowed).toBe(false);
    expect(effectiveAuthorization(ctx('company.read'), facts({ platformRole: 'superadmin', membershipRole: null, platformCompanyContext: true })).allowed).toBe(true);
  });
  it('unknown membership role fail-closed', () => {
    expect(effectiveAuthorization(ctx('company.read'), facts({ membershipRole: 'invented-role' })).reason).toBe('UNKNOWN_ROLE');
  });
  it('shared helpers server va direct-URL affordance uchun bir xil qaror qaytaradi', () => {
    expect(authorize(ctx('project.read'), facts()).allowed).toBe(true);
    expect(canAccessProject(ctx('company.read'), facts()).allowed).toBe(true);
    expect(canAccessObject(ctx('company.read'), facts()).allowed).toBe(true);
    expect(hasCapability(facts({ capabilities: { 'documents.read': true } }), 'documents.read')).toBe(true);
  });
});
