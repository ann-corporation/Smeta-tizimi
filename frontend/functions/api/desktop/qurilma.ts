import { sessiyaOl, tekshir } from '../../_shared/auth';
import { roleAuthority, sessiyaYaroqsizmi, yaroqsizSessiyaJavob } from '../../_shared/role-authority';
import { base64url, desktopCsrfAllowed, desktopDenyCode, desktopFail, desktopRpc, deviceHash, ilovaVersiya, positiveId, uuid, verifiedDesktopDevice, type DesktopEnv } from '../../_shared/desktop-device';

/** Optional device label (display only, never an authority). Control characters removed, bounded. */
const matn = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\p{Cc}/gu, '').trim().slice(0, max);
  return s || null;
};
/** Enrollment refusals → HTTP status. Policy codes are explicit so the client/user sees why. */
const ENROLL_STATUS: Record<string, number> = { OPERATION_ALREADY_USED: 409, DEVICE_LIMIT: 429, DESKTOP_DISABLED: 403, DESKTOP_UPDATE_REQUIRED: 426 };

/** Enrollment needs a web session; a verified device may revoke only itself. */
const command: PagesFunction<DesktopEnv> = async ctx => {
  const bearer = ctx.request.headers.has('Authorization');
  if (bearer && ctx.request.method !== 'DELETE') return desktopFail(401, 'WEB_SESSION_REQUIRED');
  const sess = bearer ? await sessiyaOl(ctx.request, ctx.env) : await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT);
  const device = verifiedDesktopDevice(ctx.request);
  if (bearer && !device) return desktopFail(401, desktopDenyCode(ctx.request));
  if (!desktopCsrfAllowed(ctx.request)) return desktopFail(403, 'ORIGIN_INVALID');
  if (!sess || !positiveId(sess.foydalanuvchi_id)) return desktopFail(401, 'AUTH_REQUIRED');
  const authority = await roleAuthority(sess, ctx.env);
  if (!authority && sessiyaYaroqsizmi(sess)) return yaroqsizSessiyaJavob();
  if (!authority) return desktopFail(503, 'AUTHORITY_UNAVAILABLE');
  let b: Record<string, unknown>;
  try {
    b = await ctx.request.json();
    if (!b || typeof b !== 'object' || Array.isArray(b) || !uuid(b.operation_id)) return desktopFail(400, 'OPERATION_ID_REQUIRED');
  } catch { return desktopFail(400, 'BODY_INVALID'); }
  try {
    if (ctx.request.method === 'DELETE') {
      if (!uuid(b.device_id)) return desktopFail(400, 'DEVICE_ID_INVALID');
      if (bearer && b.device_id !== device!.device_id) return desktopFail(403, 'DEVICE_FORBIDDEN');
      const r = await desktopRpc(ctx.env, 't2_desktop_qurilma_bekor_v1', { p_actor_id: sess.foydalanuvchi_id, p_device_id: b.device_id, p_operation_id: b.operation_id });
      if (r.ok !== true) return desktopFail(403, 'DEVICE_FORBIDDEN');
      return Response.json({ ok: true, device_id: b.device_id }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const token = base64url(crypto.getRandomValues(new Uint8Array(32)));
    const deviceId = crypto.randomUUID();
    // Policy (kill switch, per-user cap, minimum app version) is enforced inside the RPC, not here.
    const r = await desktopRpc(ctx.env, 't2_desktop_qurilma_yarat_v2', {
      p_actor_id: sess.foydalanuvchi_id, p_device_id: deviceId, p_token_hash: await deviceHash(token),
      p_sessiya_exp: sess.exp, p_operation_id: b.operation_id,
      p_qurilma_nomi: matn(b.qurilma_nomi, 120), p_os: matn(b.os, 60), p_ilova_versiya: ilovaVersiya(b.ilova_versiya),
    });
    // Duplicate operation cannot return a previously issued secret (only its hash exists).
    if (r.ok !== true) {
      const code = String(r.code || 'DEVICE_FORBIDDEN');
      return Response.json({ ok: false, code, ...(typeof r.min_versiya === 'string' ? { min_versiya: r.min_versiya } : {}) },
        { status: ENROLL_STATUS[code] ?? 403, headers: { 'Cache-Control': 'no-store' } });
    }
    if (r.device_id !== deviceId || typeof r.tugaydi !== 'number' || r.tugaydi <= Date.now()) return desktopFail(502, 'DEVICE_DB_INVALID');
    return Response.json({ ok: true, device_id: deviceId, token, tugaydi: r.tugaydi }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return desktopFail(503, 'DESKTOP_DB_UNAVAILABLE'); }
};
export const onRequestPost = command;
export const onRequestDelete = command;
