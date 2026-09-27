import { describe, expect, it } from 'vitest';
import {
  AGENT_ROLE_CATALOG,
  approvalRequiredForWrite,
  canTransition,
  initialRunState,
  isPrivilegedApprovalRole,
  isTerminalRunState,
  isToolAllowed,
  scopeIdsAreConsistent,
} from './agent-control-plane';

describe('agent control plane policy', () => {
  it('registers exactly the ten bounded construction roles', () => {
    expect(AGENT_ROLE_CATALOG).toHaveLength(10);
    expect(AGENT_ROLE_CATALOG).toContain('pto');
    expect(AGENT_ROLE_CATALOG).toContain('quality');
  });

  it('starts approval-required runs fail-closed', () => {
    expect(initialRunState(true)).toBe('approval_required');
    expect(initialRunState(false)).toBe('queued');
    expect(approvalRequiredForWrite('human_approval_required')).toBe(true);
    expect(approvalRequiredForWrite('read_only')).toBe(false);
  });

  it('allows only explicit state transitions', () => {
    expect(canTransition('approval_required', 'queued')).toBe(true);
    expect(canTransition('queued', 'completed')).toBe(false);
    expect(canTransition('completed', 'running')).toBe(false);
    expect(isTerminalRunState('cancelled')).toBe(true);
  });

  it('does not infer tool execution from a name', () => {
    expect(isToolAllowed(['f2.read'], 'f2.read')).toBe(true);
    expect(isToolAllowed(['f2.read'], 'arbitrary.sql')).toBe(false);
    expect(isToolAllowed([], 'f2.read')).toBe(false);
  });

  it('keeps approval and scope rules explicit', () => {
    expect(isPrivilegedApprovalRole('boss')).toBe(true);
    expect(isPrivilegedApprovalRole('pto')).toBe(false);
    expect(scopeIdsAreConsistent({ kompaniya_id: null, loyiha_id: 1 })).toBe(false);
    expect(scopeIdsAreConsistent({ kompaniya_id: 4, loyiha_id: 2, obyekt_id: 7 })).toBe(true);
    expect(scopeIdsAreConsistent({ kompaniya_id: 4, loyiha_id: 0 })).toBe(false);
  });
});
