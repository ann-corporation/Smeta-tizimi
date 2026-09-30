import type {
  AgentApprovalDecisionInput,
  AgentControlError,
  AgentControlReadModel,
  AgentRunStartInput,
  AgentRunTransitionInput,
  AgentToolPrepareInput,
} from '../lib/agent-control-plane';

function toError(payload: any, status: number): AgentControlError {
  const error = new Error(payload?.xato || payload?.code || `HTTP_${status}`) as AgentControlError;
  error.code = payload?.code || `HTTP_${status}`;
  error.status = status;
  return error;
}

async function request<T>(init?: RequestInit, query?: Record<string, string>): Promise<T> {
  const url = new URL('/api/agent-control', window.location.origin);
  for (const [key, value] of Object.entries(query || {})) url.searchParams.set(key, value);
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) throw toError(payload, response.status);
  return payload as T;
}

export function agentControlOl(kompaniyaId?: number | null): Promise<AgentControlReadModel> {
  return request<AgentControlReadModel>(undefined, kompaniyaId == null ? undefined : { kompaniya_id: String(kompaniyaId) });
}

export function agentRunStart(input: AgentRunStartInput) {
  return request<{ ok: true; run_id: number; operation_id: string; holat: string; versiya: number }>({
    method: 'POST', body: JSON.stringify({ action: 'run_start', ...input }),
  });
}

export function agentRunTransition(input: AgentRunTransitionInput) {
  return request<{ ok: true; run_id: number; holat: string; versiya: number }>({
    method: 'POST', body: JSON.stringify({ action: 'run_transition', ...input }),
  });
}

export function agentApprovalDecide(input: AgentApprovalDecisionInput) {
  return request<{ ok: true; run_id: number; decision: string; holat: string; versiya: number }>({
    method: 'POST', body: JSON.stringify({ action: 'approval_decide', ...input }),
  });
}

/** Ishchi agentni ishga tushirish (run 'queued' bo'lishi — ya'ni tasdiqlangan — shart). */
export function agentWorkerRun(input: { agent_kod: string; run_id: number; expected_version: number; operation_id?: string }) {
  return request<{ ok: true; run_id: number; holat: string; versiya: number; result: Record<string, unknown> }>({
    method: 'POST', body: JSON.stringify({ action: 'worker_run', ...input }),
  });
}

export function agentToolPrepare(input: AgentToolPrepareInput) {
  return request<{ ok: true; tool_call_id: number; run_id: number; sequence_no: number; tool_kod: string; holat: string }>({
    method: 'POST', body: JSON.stringify({ action: 'tool_prepare', ...input }),
  });
}
