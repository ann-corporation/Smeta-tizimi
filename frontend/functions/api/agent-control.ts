import { tekshir } from '../_shared/auth';
import { supabaseBaseUrl } from '../_shared/supabase-url';
import { xavfsizUpstream, xavfsizXato } from '../_shared/xato';

type Env = { SUPABASE_URL: string; SUPABASE_KEY: string; SESSIYA_KALIT: string };

const RPC = {
  run_start: 't2_agent_run_start_v1',
  run_transition: 't2_agent_run_transition_v1',
  approval_decide: 't2_agent_approval_decide_v1',
  tool_prepare: 't2_agent_tool_call_prepare_v1',
  read: 't2_agent_control_v1',
  /* Ishchi agentlar (2026-10-01): run 'queued' → tahlil → 'waiting_review'. Faqat ro'yxatdagi ishchilar. */
  worker_run: 'worker',
} as const;

/** Agent → ishchi RPC (faqat o'qib tahlil qiladi; biznes ma'lumotiga yozmaydi). */
const ISHCHILAR: Record<string, string> = {
  quality_handover: 't2_agent_ishchi_sifat_v1',
  pto_smeta: 't2_agent_ishchi_narx_audit_v1',
  warehouse: 't2_agent_ishchi_ombor_v1',
};

async function actor(ctx: any): Promise<{ actorId: number } | Response> {
  const session = await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT);
  if (!session?.foydalanuvchi_id) return Response.json({ ok: false, code: 'AUTH_REQUIRED' }, { status: 401 });
  if (!ctx.env.SUPABASE_URL || !ctx.env.SUPABASE_KEY) return Response.json({ ok: false, code: 'CONFIG' }, { status: 500 });
  return { actorId: Number(session.foydalanuvchi_id) };
}

async function rpc(env: Env, name: string, body: unknown) {
  const response = await fetch(`${supabaseBaseUrl(env.SUPABASE_URL)}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_KEY, Authorization: `Bearer ${env.SUPABASE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* safe wrapper below */ }
  return { response, json, text };
}

function statusFor(code: string): number {
  if (/AUTH|DENIED|PERMISSION|ACCESS/.test(code)) return 403;
  if (/NOT_FOUND/.test(code)) return 404;
  if (/STALE|CONFLICT/.test(code)) return 409;
  if (/INVALID|REQUIRED|SCOPE|TOOL/.test(code)) return 400;
  return 502;
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  try {
    const a = await actor(ctx);
    if (a instanceof Response) return a;
    const url = new URL(ctx.request.url);
    const rawCompany = url.searchParams.get('kompaniya_id');
    const company = rawCompany == null || rawCompany === '' ? null : Number(rawCompany);
    if (company !== null && (!Number.isInteger(company) || company <= 0)) return Response.json({ ok: false, code: 'COMPANY_ID_INVALID' }, { status: 400 });
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 50), 1), 100);
    const result = await rpc(ctx.env, RPC.read, { p_actor_id: a.actorId, p_kompaniya_id: company, p_limit: limit });
    if (!result.response.ok || !result.json?.ok) {
      const code = result.json?.code || 'AGENT_CONTROL_READ_FAILED';
      return xavfsizUpstream(result.response.status, result.json || result.text, statusFor(code));
    }
    return Response.json(result.json);
  } catch (error: any) {
    return xavfsizXato('AGENT_CONTROL_READ_FAILED', 500, error?.message || String(error));
  }
};

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  try {
    const a = await actor(ctx);
    if (a instanceof Response) return a;
    const body: any = await ctx.request.json().catch(() => ({}));
    const action = body?.action as keyof typeof RPC;
    if (!action || !(action in RPC) || action === 'read') return Response.json({ ok: false, code: 'AGENT_ACTION_INVALID' }, { status: 400 });
    const operationId = typeof body.operation_id === 'string' && body.operation_id ? body.operation_id : crypto.randomUUID();
    let payload: Record<string, unknown>;
    if (action === 'run_start') {
      payload = { p_actor_id: a.actorId, p_agent_kod: String(body.agent_kod || ''), p_command_kod: String(body.command_kod || ''), p_kompaniya_id: body.kompaniya_id == null ? null : Number(body.kompaniya_id), p_loyiha_id: body.loyiha_id == null ? null : Number(body.loyiha_id), p_obyekt_id: body.obyekt_id == null ? null : Number(body.obyekt_id), p_operation_id: operationId, p_input: body.input || {}, p_requires_approval: body.requires_approval !== false };
    } else if (action === 'run_transition') {
      payload = { p_actor_id: a.actorId, p_run_id: Number(body.run_id), p_new_holat: String(body.new_holat || ''), p_expected_version: Number(body.expected_version), p_operation_id: operationId, p_result: body.result ?? null, p_error_code: body.error_code ?? null, p_error_detail: body.error_detail ?? null };
    } else if (action === 'worker_run') {
      const rpcNom = ISHCHILAR[String(body.agent_kod || '')];
      if (!rpcNom) return Response.json({ ok: false, code: 'WORKER_NOT_AVAILABLE' }, { status: 400 });
      const result = await rpc(ctx.env, rpcNom, { p_actor_id: a.actorId, p_run_id: Number(body.run_id), p_expected_version: Number(body.expected_version), p_operation_id: operationId });
      if (!result.response.ok || !result.json?.ok) {
        const code = result.json?.code || 'AGENT_WORKER_FAILED';
        return xavfsizUpstream(result.response.status, result.json || result.text, statusFor(code));
      }
      return Response.json({ ...result.json, operation_id: operationId });
    } else if (action === 'approval_decide') {
      payload = { p_actor_id: a.actorId, p_run_id: Number(body.run_id), p_decision: String(body.decision || ''), p_sabab: body.sabab ?? null, p_expected_version: Number(body.expected_version), p_operation_id: operationId };
    } else {
      payload = { p_actor_id: a.actorId, p_run_id: Number(body.run_id), p_tool_kod: String(body.tool_kod || ''), p_request: body.request || {}, p_operation_id: operationId, p_sequence_no: body.sequence_no == null ? null : Number(body.sequence_no) };
    }
    const result = await rpc(ctx.env, RPC[action], payload);
    if (!result.response.ok || !result.json?.ok) {
      const code = result.json?.code || 'AGENT_COMMAND_FAILED';
      return xavfsizUpstream(result.response.status, result.json || result.text, statusFor(code));
    }
    return Response.json({ ...result.json, operation_id: operationId });
  } catch (error: any) {
    return xavfsizXato('AGENT_COMMAND_FAILED', 500, error?.message || String(error));
  }
};
