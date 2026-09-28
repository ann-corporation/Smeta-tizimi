import { describe, expect, it } from 'vitest';
import { f2LifecycleError, f2LifecyclePlan } from './f2-lifecycle-workflow';

describe('F2 interruption recovery', () => {
  it.each([
    ['draft', ['submitted', 'checked', 'approved']],
    ['submitted', ['checked', 'approved']],
    ['checked', ['approved']],
    ['approved', []],
    ['rejected', ['submitted', 'checked', 'approved']],
  ] as const)('resumes approval from %s without repeating committed stages', (state, expected) => {
    expect(f2LifecyclePlan(state, 'approved')).toEqual(expected);
  });
  it.each(['approved', 'cancelled', 'superseded'] as const)('cannot reject frozen/terminal %s', state => {
    expect(f2LifecyclePlan(state, 'rejected')).toBeNull();
  });
  it('rejects a checked document directly, without submitting it again', () => {
    expect(f2LifecyclePlan('checked', 'rejected')).toEqual(['rejected']);
  });
  it('allows reason-bound cancellation from intermediate state', () => {
    expect(f2LifecyclePlan('submitted', 'cancelled')).toEqual(['cancelled']);
    expect(f2LifecyclePlan('approved', 'cancelled')).toBeNull();
  });
  it('fails closed for an unknown server state', () => {
    expect(f2LifecyclePlan('unknown' as 'draft', 'approved')).toBeNull();
  });
  it('does not disclose upstream SQL/JSON in user messages', () => {
    expect(f2LifecycleError('23503 SQL internal')).not.toMatch(/23503|SQL|internal|JSON/);
    expect(f2LifecycleError('STALE_VERSION')).toContain('yangilangan');
  });
});
