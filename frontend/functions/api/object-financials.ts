import { cachedAuthority } from '../_shared/permission-policy';
import { tekshir } from '../_shared/auth';
import { supabaseBaseUrl } from '../_shared/supabase-url';

type Env = { SESSIYA_KALIT: string; SUPABASE_URL?: string; SUPABASE_KEY?: string };
const id = (text: string | null): number | null => text != null && /^[1-9]\d*$/.test(text) && Number.isSafeInteger(Number(text)) ? Number(text) : null;
/** Strict bounded company request. Actor and RPC are never accepted from the client. */
export function financialRequest(params: URLSearchParams, actor: number): Record<string, unknown> | null {
  const company = id(params.get('kompaniya_id'));
  const raw = params.get('obyektlar');
  if (!company || !raw || raw.length > 4000) return null;
  const parts = raw.split(',');
  if (parts.length > 200 || parts.some(p => id(p) == null)) return null;
  return { p_kompaniya_id: company, p_actor_id: actor, p_object_ids: [...new Set(parts.map(Number))] };
}
export const onRequest: PagesFunction<Env> = async ctx => {
  const headers = { 'Cache-Control': 'no-store' };
  const fail = (code: string, status: number) => Response.json({ ok: false, code }, { status, headers });
  if (ctx.request.method !== 'GET') return fail('METHOD_INVALID', 405);
  const sess = cachedAuthority(ctx) ?? await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT).catch(() => null);
  if (!sess?.foydalanuvchi_id) return fail('AUTH_REQUIRED', 401);
  if (!ctx.env.SUPABASE_URL || !ctx.env.SUPABASE_KEY) return fail('SERVER_NOT_CONFIGURED', 503);
  const payload = financialRequest(new URL(ctx.request.url).searchParams, sess.foydalanuvchi_id);
  if (!payload) return fail('INVALID_INPUT', 400);
  try {
    const response = await fetch(`${supabaseBaseUrl(ctx.env.SUPABASE_URL)}/rest/v1/rpc/t2_object_financials_v1`, {
      method: 'POST', headers: { apikey: ctx.env.SUPABASE_KEY, Authorization: `Bearer ${ctx.env.SUPABASE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json() as Record<string, unknown>;
    if (!response.ok) return fail(data.code === '42501' ? 'FORBIDDEN' : 'FINANCIALS_UNAVAILABLE', data.code === '42501' ? 403 : 502);
    if (data.ok !== true || data.kompaniya_id !== payload.p_kompaniya_id || !Array.isArray(data.objects)) return fail('FINANCIALS_UNAVAILABLE', 502);
    return Response.json(data, { headers });
  } catch { return fail('NETWORK_ERROR', 502); }
};
