/**
 * /api/desktop/nazorat — «Tizim nazorati → Desktop» admin transport (AUTH-SENSITIVE).
 *
 *   GET  /api/desktop/nazorat                      platform superadmin: all companies
 *   GET  /api/desktop/nazorat?kompaniya_id=<n>     superadmin or that company's boss/admin: own company only
 *   POST /api/desktop/nazorat { action, ... }      bekor | foydalanuvchi_bekor | muddat | siyosat (audited)
 *
 * Web session (cookie) only — a desktop bearer can never administer devices. Actor ALWAYS comes from the verified
 * session; every authorization decision (superadmin / boss-admin of the company / tenant isolation) is made in the
 * service-role RPC, not here and not in the UI. Path segment is deliberately not «boshqaruv» (that name is a
 * control.global API in the tenant middleware and would lock company bosses out).
 */
import { tekshir } from '../../_shared/auth';
import { roleAuthority, sessiyaYaroqsizmi, yaroqsizSessiyaJavob } from '../../_shared/role-authority';
import { desktopCsrfAllowed, desktopFail, desktopRpc, positiveId, uuid, type DesktopEnv } from '../../_shared/desktop-device';

const AMALLAR = new Set(['bekor', 'foydalanuvchi_bekor', 'muddat', 'siyosat']);
const STATUS: Record<string, number> = {
  AUTHORIZATION_DENIED: 403, SUPERADMIN_REQUIRED: 403, TENANT_FORBIDDEN: 403, MULTI_COMPANY_SUPERADMIN_REQUIRED: 403, BOSS_PROTECTED: 403,
  DEVICE_NOT_FOUND: 404, TARGET_NOT_FOUND: 404, COMPANY_NOT_FOUND: 404, STALE_VERSION: 409, VERSION_REQUIRED: 409,
};
const nostore = { 'Cache-Control': 'no-store' };

async function actor(ctx: Parameters<PagesFunction<DesktopEnv>>[0]): Promise<number | Response> {
  if (ctx.request.headers.has('Authorization')) return desktopFail(401, 'WEB_SESSION_REQUIRED');
  const sess = await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT);
  if (!sess || !positiveId(sess.foydalanuvchi_id)) return desktopFail(401, 'AUTH_REQUIRED');
  // Fresh DB authority: a revoked/blocked web session never reaches the admin RPCs.
  const authority = await roleAuthority(sess, ctx.env);
  if (!authority && sessiyaYaroqsizmi(sess)) return yaroqsizSessiyaJavob();
  if (!authority) return desktopFail(503, 'AUTHORITY_UNAVAILABLE');
  return sess.foydalanuvchi_id;
}

function natija(r: Record<string, unknown>): Response {
  if (r.ok === true) return Response.json(r, { headers: nostore });
  const code = String(r.code || 'DESKTOP_NAZORAT_FAILED');
  return Response.json({ ok: false, code, ...(r.maydon ? { maydon: r.maydon } : {}) }, { status: STATUS[code] ?? 400, headers: nostore });
}

export const onRequestGet: PagesFunction<DesktopEnv> = async ctx => {
  const a = await actor(ctx);
  if (a instanceof Response) return a;
  const raw = new URL(ctx.request.url).searchParams.get('kompaniya_id');
  const kid = raw == null ? null : Number(raw);
  if (raw != null && !positiveId(kid)) return desktopFail(400, 'COMPANY_CONTEXT_INVALID');
  try { return natija(await desktopRpc(ctx.env, 't2_desktop_boshqaruv_v1', { p_actor_id: a, p_kompaniya_id: kid })); }
  catch { return desktopFail(503, 'DESKTOP_DB_UNAVAILABLE'); }
};

export const onRequestPost: PagesFunction<DesktopEnv> = async ctx => {
  if (!desktopCsrfAllowed(ctx.request)) return desktopFail(403, 'ORIGIN_INVALID');
  const a = await actor(ctx);
  if (a instanceof Response) return a;
  let b: Record<string, unknown>;
  try { b = await ctx.request.json(); } catch { return desktopFail(400, 'BODY_INVALID'); }
  if (!b || typeof b !== 'object' || Array.isArray(b)) return desktopFail(400, 'BODY_INVALID');
  const action = String(b.action ?? '');
  if (!AMALLAR.has(action)) return desktopFail(400, 'ACTION_INVALID');
  if (!uuid(b.operation_id)) return desktopFail(400, 'OPERATION_ID_REQUIRED');
  if (b.kompaniya_id != null && !positiveId(b.kompaniya_id)) return desktopFail(400, 'COMPANY_CONTEXT_INVALID');
  const sabab = typeof b.sabab === 'string' ? b.sabab.slice(0, 500) : null;
  const kid = b.kompaniya_id ?? null;
  try {
    if (action === 'siyosat') {
      if (!b.qiymat || typeof b.qiymat !== 'object' || Array.isArray(b.qiymat)) return desktopFail(400, 'POLICY_FIELD_INVALID');
      return natija(await desktopRpc(ctx.env, 't2_desktop_siyosat_saqla_v1', {
        p_actor_id: a, p_kompaniya_id: kid, p_manba: String(b.manba ?? ''), p_qiymat: b.qiymat, p_sabab: sabab,
        p_expected_versiya: Number.isSafeInteger(b.expected_versiya) ? b.expected_versiya : null, p_operation_id: b.operation_id,
      }));
    }
    if (action !== 'foydalanuvchi_bekor' && !uuid(b.device_id)) return desktopFail(400, 'DEVICE_ID_INVALID');
    if (action === 'foydalanuvchi_bekor' && !positiveId(b.foydalanuvchi_id)) return desktopFail(400, 'TARGET_INVALID');
    if (action === 'muddat' && !(typeof b.tugaydi === 'number' && Number.isSafeInteger(b.tugaydi))) return desktopFail(400, 'EXPIRY_INVALID');
    return natija(await desktopRpc(ctx.env, 't2_desktop_boshqaruv_buyruq_v1', {
      p_actor_id: a, p_amal: action, p_kompaniya_id: kid,
      p_device_id: action === 'foydalanuvchi_bekor' ? null : b.device_id,
      p_foydalanuvchi_id: action === 'foydalanuvchi_bekor' ? b.foydalanuvchi_id : null,
      p_tugaydi: action === 'muddat' ? b.tugaydi : null, p_sabab: sabab, p_operation_id: b.operation_id,
    }));
  } catch { return desktopFail(503, 'DESKTOP_DB_UNAVAILABLE'); }
};
