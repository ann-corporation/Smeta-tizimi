import type { AgentRunState } from './types';

export const AGENT_ROLE_CATALOG = [
  'orchestrator',
  'company_access',
  'project_contract',
  'pto',
  'document_control',
  'procurement',
  'warehouse',
  'finance',
  'schedule',
  'quality',
] as const;

export const AGENT_RUN_TRANSITIONS: Readonly<Record<AgentRunState, readonly AgentRunState[]>> = {
  queued: ['running', 'cancelled'],
  running: ['waiting_review', 'applying', 'exporting', 'completed', 'failed', 'cancelled'],
  waiting_review: ['queued', 'cancelled'],
  approval_required: ['queued', 'cancelled'],
  applying: ['completed', 'failed', 'cancelled'],
  exporting: ['completed', 'failed', 'cancelled'],
  failed: ['queued', 'cancelled'],
  completed: [],
  cancelled: [],
};

export function canTransition(from: AgentRunState, to: AgentRunState): boolean {
  return AGENT_RUN_TRANSITIONS[from].includes(to);
}

export function initialRunState(requiresApproval: boolean): AgentRunState {
  return requiresApproval ? 'approval_required' : 'queued';
}

export function isTerminalRunState(state: AgentRunState): boolean {
  return state === 'completed' || state === 'cancelled';
}

export function isPrivilegedApprovalRole(role: string | null | undefined): boolean {
  return role === 'boss' || role === 'rahbar' || role === 'superadmin';
}

/**
 * A tool is a stable capability code. This guard deliberately rejects an
 * empty allowlist and never treats a tool name as an executable function or
 * SQL fragment.
 */
export function isToolAllowed(allowedTools: readonly string[], toolCode: string): boolean {
  return toolCode.trim().length > 0 && allowedTools.includes(toolCode);
}

export function approvalRequiredForWrite(permissionMode: string): boolean {
  return permissionMode === 'human_approval_required' || permissionMode === 'command_prepare';
}

export function scopeIdsAreConsistent(input: {
  kompaniya_id: number | null;
  loyiha_id?: number | null;
  obyekt_id?: number | null;
}): boolean {
  if (input.kompaniya_id == null) return input.loyiha_id == null && input.obyekt_id == null;
  return [input.kompaniya_id, input.loyiha_id, input.obyekt_id]
    .filter((value) => value != null)
    .every((value) => Number.isInteger(value) && Number(value) > 0);
}
