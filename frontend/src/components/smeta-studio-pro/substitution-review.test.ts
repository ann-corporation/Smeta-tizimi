// @vitest-environment node
import { expect, it } from 'vitest';
import type { CatalogResource, Substitution } from '../../lib/smeta-studio/model';
import { reviewSubstitution } from './substitution-review';
const source: CatalogResource = { id: 'old', name: 'Concrete B7.5', code: 'C1', type: 'M', unitCode: 'm3' };
const request = (patch: Partial<Substitution> = {}): Substitution => ({ resource: { ...source, id: 'new', name: 'Concrete B15' },
  conversion: '1', conversionEvidence: null, reason: 'Design revision', normOverride: null, ...patch });
it('matching type/unit permits operator review, not automatic normative approval', () => {
  expect(reviewSubstitution(source, request())).toEqual({ issues: [], readyForOperatorReview: true });
});
it('factor one with changed units still requires evidence', () => {
  expect(reviewSubstitution(source, request({ resource: { ...source, unitCode: 't' } })).issues).toContain('UNIT_CONVERSION_EVIDENCE_REQUIRED');
});
it('explicit unit-conversion evidence is retained and permits review', () => {
  expect(reviewSubstitution(source, request({ resource: { ...source, unitCode: 't' }, conversion: '2.4', conversionEvidence: 'Approved density calculation' })).readyForOperatorReview).toBe(true);
});
it('labor cannot silently replace material', () => {
  expect(reviewSubstitution(source, request({ resource: { ...source, type: 'L' } })).issues).toContain('RESOURCE_TYPE_MISMATCH');
});
it('missing resource type is unknown, not equivalent', () => {
  expect(reviewSubstitution(source, request({ resource: { ...source, type: null } })).issues).toContain('RESOURCE_TYPE_UNKNOWN');
});
it.each(['0', '-1', 'NaN', '1/2'])('invalid conversion %s blocks review', conversion => {
  expect(reviewSubstitution(source, request({ conversion })).issues).toContain('CONVERSION_INVALID');
});
it('missing source and units remain unknown', () => {
  expect(reviewSubstitution(null, request()).issues).toContain('SOURCE_RESOURCE_UNKNOWN');
  expect(reviewSubstitution(source, request({ resource: { ...source, unitCode: null } })).issues).toContain('UNIT_UNKNOWN');
});
it('blank reason blocks review', () => {
  expect(reviewSubstitution(source, request({ reason: ' ' })).issues).toContain('REASON_REQUIRED');
});
