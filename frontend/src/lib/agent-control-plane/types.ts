export type AgentPermissionMode =
  | 'read_only'
  | 'analyze'
  | 'draft'
  | 'command_prepare'
  | 'human_approval_required';

export type AgentScope = 'global' | 'company' | 'project' | 'object';

export type AgentRunState =
  | 'queued'
  | 'running'
  | 'waiting_review'
  | 'approval_required'
  | 'applying'
  | 'exporting'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type AgentRoleCode =
  | 'orchestrator'
  | 'company_access'
  | 'project_contract'
  | 'pto'
  | 'document_control'
  | 'procurement'
  | 'warehouse'
  | 'finance'
  | 'schedule'
  | 'quality';

export type AgentToolCallState = 'prepared' | 'executed' | 'failed' | 'blocked';

export type AgentProfile = {
  kod: string;
  nom: string;
  rol: AgentRoleCode | string;
  permission_mode: AgentPermissionMode;
  allowed_commands: string[];
  allowed_tools: string[];
  default_scope: AgentScope;
  holat: 'active' | 'paused' | 'deprecated';
  versiya: number;
};

export type AgentRun = {
  run_id: number;
  operation_id: string;
  agent_kod: string;
  command_kod: string;
  holat: AgentRunState;
  kompaniya_id: number | null;
  loyiha_id: number | null;
  obyekt_id: number | null;
  versiya: number;
  created_at: string;
  updated_at: string;
};

export type AgentApproval = {
  run_id: number;
  holat: 'pending' | 'approved' | 'rejected';
  requested_at: string;
  sabab: string | null;
};

export type AgentControlReadModel = {
  ok: true;
  scope: AgentScope;
  agents: AgentProfile[];
  runs: AgentRun[];
  approvals: AgentApproval[];
};

export type AgentRunStartInput = {
  agent_kod: string;
  command_kod: string;
  kompaniya_id: number | null;
  loyiha_id?: number | null;
  obyekt_id?: number | null;
  input?: Record<string, unknown>;
  requires_approval?: boolean;
  operation_id?: string;
};

export type AgentRunTransitionInput = {
  run_id: number;
  new_holat: AgentRunState;
  expected_version: number;
  result?: Record<string, unknown> | null;
  error_code?: string | null;
  error_detail?: string | null;
  operation_id?: string;
};

export type AgentApprovalDecisionInput = {
  run_id: number;
  decision: 'approve' | 'reject';
  sabab?: string | null;
  expected_version: number;
  operation_id?: string;
};

export type AgentToolPrepareInput = {
  run_id: number;
  tool_kod: string;
  request?: Record<string, unknown>;
  sequence_no?: number | null;
  operation_id?: string;
};

export type AgentControlError = Error & { code?: string; status?: number };
