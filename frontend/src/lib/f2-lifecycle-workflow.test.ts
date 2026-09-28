import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { f2LifecycleError, f2LifecyclePlan } from './f2-lifecycle-workflow';

describe('PTO visible workflow regression guards', () => {
  it('keeps an explicit non-collapsing viewport for the virtual LRV tree', () => {
    const source = readFileSync(resolve(__dirname, '../admin/sahifalar/HolatNative.tsx'), 'utf8');
    expect(source).toContain('h-[65vh] min-h-[420px] shrink-0');
  });
  it('uses the shared object scope and rejects obsolete Nakopitelniy responses', () => {
    const source = readFileSync(resolve(__dirname, '../admin/sahifalar/NakopitelniyVedomost.tsx'), 'utf8');
    expect(source).toContain('workspace.scope.objectId');
    expect(source).not.toContain("const [objectId, setObjectId] = useState");
    expect(source).toContain('if (currentRequest !== requestId.current) return;');
    expect(source).toContain('return () => { ++requestId.current; };');
  });
});

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
