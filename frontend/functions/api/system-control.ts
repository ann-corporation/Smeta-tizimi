/**
 * system-control.ts — CTRL-001 System Control Center canonical transport.
 * session -> actor -> Supabase RPC. No Drive/Sheets/GAS on this path.
 *
 *   GET  /api/system-control                                      GLOBAL read model
 *        (T2-COMPANY-CONTROL-CLOSEOUT split: t2_system_control_global_v1,
 *        platform-role gated — a company boss with no platform role is
 *        denied. "Company boss: platform-wide kill switch boshqara OLMASIN.")
 *   GET  /api/system-control?kompaniya_id=<n>[&loyiha_id=<n>]     COMPANY read model (unchanged)
 *   POST /api/system-control   { action, ... }                    audited command
 *
 * actorId ALWAYS comes from the verified session — never from the request body.
 * Commands: capability_override_set | capability_killswitch | job_control | deploy_state_set
 */
import { cachedAuthority } from '../_shared/permission-policy';
import { tekshir } from '../_shared/auth';
import { supabaseBaseUrl } from '../_shared/supabase-url';
import { xavfsizUpstream, xavfsizXato } from '../_shared/xato';

type Env = { SUPABASE_URL: string; SUPABASE_KEY: string; SESSIYA_KALIT: string };

const READ_RPC = { company: 't2_system_control_v1', global: 't2_system_control_global_v1' } as const;
const GLOBAL_WRITE_GUARD_RPC = 't2_control_global_write_guard_v1';

/** POST action -> RPC. Deliberately separate from READ_RPC so a request
 *  can never address the global-read or write-guard RPCs by action name. */
const RPC = {
  capability_override_set: 't2_capability_override_set_v1',
  capability_killswitch: 't2_capability_killswitch_v1',
  job_control: 't2_job_control_v1',
  deploy_state_set: 't2_deploy_state_set_v1',
} as const;

/** job_control / deploy_state_set / capability_killswitch are always
 *  global-scope commands (a kill switch stops a capability everywhere, not
 *  per-company). capability_override_set carries an explicit scope field.
 *  Used for the defense-in-depth guard below (T2-COMPANY-CONTROL-CLOSEOUT
 *  §Phase A — "Company boss: platform-wide kill switch boshqara OLMASIN"). */
function isGlobalScopeWrite(action: string, bodyIn: any): boolean {
  if (action === 'job_control' || action === 'deploy_state_set' || action === 'capability_killswitch') return true;
  if (action === 'capability_override_set') return String(bodyIn?.scope) === 'global';
  return false;
}

async function callRpc(env: Env, name: string, body: unknown) {
  const r = await fetch(supabaseBaseUrl(env.SUPABASE_URL) + '/rest/v1/rpc/' + name, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_KEY, Authorization: 'Bearer ' + env.SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let j: any = null;
  try { j = JSON.parse(text); } catch { /* keep raw */ }
  return { r, j, text };
}

function httpStatusFor(code: string, raw: string): number {
  if (code === 'COMPANY_NOT_FOUND' || code === 'CAPABILITY_NOT_FOUND') return 404;
  if (code === 'AUTHORIZATION_DENIED' || /actor|a'zo|azo|membership|PERMISSION_DENIED/i.test(code + raw)) return 403;
  if (code === 'STALE_VERSION') return 409;
  if (code === 'OPERATION_ID_REQUIRED' || code === 'CONTROL_SCOPE_INVALID') return 400;
  if (code === 'KILLSWITCH_ACTIVE' || code === 'JOB_NOT_PAUSABLE') return 422;
  return 502;
}

async function actorFromSession(ctx: any): Promise<{ actorId: number } | Response> {
  const sess = cachedAuthority(ctx) ?? await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT);
  if (!sess) return Response.json({ ok: false, code: 'AUTH_REQUIRED' }, { status: 401 });
  const actorId = (sess as any).foydalanuvchi_id;
  if (actorId == null) return Response.json({ ok: false, code: 'AUTH_REQUIRED', xato: 'Sessiyada foydalanuvchi yo‘q — qayta kiring' }, { status: 401 });
  if (!ctx.env.SUPABASE_URL || !ctx.env.SUPABASE_KEY) return Response.json({ ok: false, code: 'CONFIG' }, { status: 500 });
  return { actorId };
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  try {
    const a = await actorFromSession(ctx);
    if (a instanceof Response) return a;
    const url = new URL(ctx.request.url);
    const kompRaw = url.searchParams.get('kompaniya_id');

    // No kompaniya_id -> GLOBAL read (platform-role gated at the DB layer;
    // a company boss with no platform role gets AUTHORIZATION_DENIED, not
    // the company-scoped data). "/admin/system-control" without a company
    // selected is exactly this call.
    if (!kompRaw) {
      const { r, j, text } = await callRpc(ctx.env, READ_RPC.global, { p_actor_id: a.actorId });
      if (!r.ok || !j || j.ok !== true) {
        const code = (j && j.code) || 'SYSTEM_CONTROL_FAILED';
        return xavfsizUpstream(r.status, j || text, httpStatusFor(code, text));
      }
      return Response.json(j);
    }

    const kompaniyaId = Number(kompRaw);
    if (!kompaniyaId) return Response.json({ ok: false, code: 'COMPANY_CONTEXT_REQUIRED' }, { status: 400 });
    const loyihaRaw = url.searchParams.get('loyiha_id');
    const loyihaId = loyihaRaw ? Number(loyihaRaw) : null;

    const { r, j, text } = await callRpc(ctx.env, READ_RPC.company, { p_kompaniya_id: kompaniyaId, p_actor_id: a.actorId, p_loyiha_id: loyihaId });
    if (!r.ok || !j || j.ok !== true) {
      const code = (j && j.code) || 'SYSTEM_CONTROL_FAILED';
      return xavfsizUpstream(r.status, j || text, httpStatusFor(code, text));
    }
    return Response.json(j);
  } catch (err: any) {
    return xavfsizXato('SYSTEM_CONTROL_FAILED', 500, err?.message || String(err));
  }
};

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  try {
    const a = await actorFromSession(ctx);
    if (a instanceof Response) return a;
    const bodyIn: any = await ctx.request.json().catch(() => ({}));
    const action: string = bodyIn?.action;
    if (!action || !(action in RPC) || action === 'read') {
      return Response.json({ ok: false, code: 'CONTROL_ACTION_INVALID' }, { status: 400 });
    }
    // Defense in depth: global-scope writes are re-checked against the
    // shared authorization core BEFORE reaching the existing command RPC
    // (which also checks, independently). The owner's law, enforced twice:
    // "Company boss: platform-wide kill switch boshqara OLMASIN."
    if (isGlobalScopeWrite(action, bodyIn)) {
      const guard = await callRpc(ctx.env, GLOBAL_WRITE_GUARD_RPC, { p_actor_id: a.actorId });
      if (!guard.r.ok || !guard.j || guard.j.allowed !== true) {
        return Response.json({ ok: false, code: 'AUTHORIZATION_DENIED', reason: guard.j?.reason }, { status: 403 });
      }
    }

    // operation_id: accept a client-supplied uuid for idempotency, else mint one
    const opId: string = typeof bodyIn.operation_id === 'string' && bodyIn.operation_id ? bodyIn.operation_id : crypto.randomUUID();

    let rpcBody: Record<string, unknown>;
    if (action === 'capability_override_set') {
      rpcBody = {
        p_actor_id: a.actorId, p_kod: String(bodyIn.kod ?? ''), p_scope: String(bodyIn.scope ?? ''),
        p_scope_id: bodyIn.scope_id == null ? null : Number(bodyIn.scope_id),
        p_holat: String(bodyIn.holat ?? ''), p_sabab: bodyIn.sabab == null ? null : String(bodyIn.sabab),
        p_expected_version: bodyIn.expected_version == null ? null : Number(bodyIn.expected_version),
        p_operation_id: opId,
      };
    } else if (action === 'capability_killswitch') {
      rpcBody = {
        p_actor_id: a.actorId, p_kod: String(bodyIn.kod ?? ''), p_on: bodyIn.on === true,
        p_sabab: bodyIn.sabab == null ? null : String(bodyIn.sabab), p_operation_id: opId,
      };
    } else if (action === 'job_control') {
      rpcBody = {
        p_actor_id: a.actorId, p_job_kod: String(bodyIn.job_kod ?? ''), p_action: String(bodyIn.job_action ?? ''),
        p_operation_id: opId,
      };
    } else { // deploy_state_set
      rpcBody = {
        p_actor_id: a.actorId,
        p_main_sha: bodyIn.main_sha == null ? null : String(bodyIn.main_sha),
        p_frontend_deploy_id: bodyIn.frontend_deploy_id == null ? null : String(bodyIn.frontend_deploy_id),
        p_gas_deploy_version: bodyIn.gas_deploy_version == null ? null : String(bodyIn.gas_deploy_version),
        p_db_migration_head: bodyIn.db_migration_head == null ? null : String(bodyIn.db_migration_head),
        p_operation_id: opId,
      };
    }

    const { r, j, text } = await callRpc(ctx.env, (RPC as any)[action], rpcBody);
    if (!r.ok || !j || j.ok !== true) {
      const code = (j && j.code) || 'CONTROL_COMMAND_FAILED';
      return xavfsizUpstream(r.status, j || text, httpStatusFor(code, text));
    }
    return Response.json({ ...j, operation_id: opId });
  } catch (err: any) {
    return xavfsizXato('CONTROL_COMMAND_FAILED', 500, err?.message || String(err));
  }
};
