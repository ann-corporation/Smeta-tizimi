import { tekshir } from '../_shared/auth';
import { cachedAuthority } from '../_shared/permission-policy';
import { supabaseBaseUrl } from '../_shared/supabase-url';

type Env = { SESSIYA_KALIT: string; SUPABASE_URL?: string; SUPABASE_KEY?: string };
const positiveId = (v: unknown): number | null => typeof v === 'number' && Number.isSafeInteger(v) && v > 0 ? v : null;
export function scopeRequest(body: Record<string, unknown>, actor: number, write: boolean): Record<string, unknown> | null {
  const object = positiveId(body.obyekt_id);
  if (!object) return null;
  if (!write) return { p_actor_id: actor, p_obyekt_id: object };
  if (!positiveId(body.qator_id) || !positiveId(body.qator_version) || !Number.isSafeInteger(body.basis_version) || Number(body.basis_version) < 0 ||
    typeof body.operation_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.operation_id)) return null;
  return { p_actor_id: actor, p_obyekt_id: object, p_qator_id: body.qator_id, p_qator_version: body.qator_version,
    p_basis_version: body.basis_version, p_basis: body.basis, p_operation_id: body.operation_id };
}
export const onRequest: PagesFunction<Env> = async ctx => {
  const write = ctx.request.method === 'POST';
  if (!write && ctx.request.method !== 'GET') return Response.json({ ok: false, code: 'METHOD_INVALID' }, { status: 405 });
  const origin = ctx.request.headers.get('Origin');
  if (write && (ctx.request.headers.get('Sec-Fetch-Site') === 'cross-site' || (origin && origin !== new URL(ctx.request.url).origin))) return Response.json({ ok: false, code: 'ORIGIN_INVALID' }, { status: 403 });
  const sess = cachedAuthority(ctx) ?? await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT).catch(() => null);
  if (!sess?.foydalanuvchi_id) return Response.json({ ok: false, code: 'AUTH_REQUIRED' }, { status: 401 });
  if (!ctx.env.SUPABASE_URL || !ctx.env.SUPABASE_KEY) return Response.json({ ok: false, code: 'SERVER_NOT_CONFIGURED' }, { status: 503 });
  let body: Record<string, unknown>;
  try {
    if (write) {
      if (Number(ctx.request.headers.get('content-length')) > 16000) return Response.json({ ok: false, code: 'PAYLOAD_TOO_LARGE' }, { status: 413 });
      const raw = await ctx.request.text(); if (raw.length > 16000) return Response.json({ ok: false, code: 'PAYLOAD_TOO_LARGE' }, { status: 413 });
      body = JSON.parse(raw) as Record<string, unknown>;
    } else body = { obyekt_id: Number(new URL(ctx.request.url).searchParams.get('obyekt_id')) };
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('INVALID_BODY');
  } catch { return Response.json({ ok: false, code: 'INVALID_BODY' }, { status: 400 }); }
  const payload = scopeRequest(body, sess.foydalanuvchi_id, write);
  if (!payload) return Response.json({ ok: false, code: 'INVALID_INPUT' }, { status: 400 });
  try {
    const response = await fetch(`${supabaseBaseUrl(ctx.env.SUPABASE_URL)}/rest/v1/rpc/${write ? 't2_contract_scope_set_v1' : 't2_contract_scope_read_v1'}`, {
      method: 'POST', headers: { apikey: ctx.env.SUPABASE_KEY, Authorization: `Bearer ${ctx.env.SUPABASE_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    const data = await response.json() as Record<string, unknown>;
    if (!response.ok) {
      const message = String(data.message ?? '');
      const code = ['STALE_VERSION', 'STALE_BASIS_VERSION', 'OPERATION_CONFLICT', 'BASIS_INVALID', 'CONTRACT_SCOPE_INVALID'].find(c => message.includes(c)) ?? (data.code === '42501' ? 'FORBIDDEN' : 'SCOPE_UNAVAILABLE');
      return Response.json({ ok: false, code }, { status: code.startsWith('STALE') || code === 'OPERATION_CONFLICT' ? 409 : code === 'FORBIDDEN' ? 403 : 422, headers: { 'Cache-Control': 'no-store' } });
    }
    return Response.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ ok: false, code: 'NETWORK_ERROR' }, { status: 502 }); }
};
