import { tekshir } from '../../_shared/auth';
import { roleAuthority, sessiyaYaroqsizmi, yaroqsizSessiyaJavob } from '../../_shared/role-authority';
import { base64url, desktopCsrfAllowed, desktopFail, desktopRpc, deviceHash, positiveId, uuid, type DesktopEnv } from '../../_shared/desktop-device';

/** Web-session only issuance/revoke. Native captures cookie in Rust, never returns it to JS. */
const command: PagesFunction<DesktopEnv> = async ctx => {
  if (!desktopCsrfAllowed(ctx.request)) return desktopFail(403, 'ORIGIN_INVALID');
  if (ctx.request.headers.has('Authorization')) return desktopFail(401, 'WEB_SESSION_REQUIRED');
  const sess = await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT);
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
      const r = await desktopRpc(ctx.env, 't2_desktop_qurilma_bekor_v1', { p_actor_id: sess.foydalanuvchi_id, p_device_id: b.device_id, p_operation_id: b.operation_id });
      if (r.ok !== true) return desktopFail(403, 'DEVICE_FORBIDDEN');
      return Response.json({ ok: true, device_id: b.device_id }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const token = base64url(crypto.getRandomValues(new Uint8Array(32)));
    const deviceId = crypto.randomUUID();
    const r = await desktopRpc(ctx.env, 't2_desktop_qurilma_yarat_v1', {
      p_actor_id: sess.foydalanuvchi_id, p_device_id: deviceId, p_token_hash: await deviceHash(token),
      p_sessiya_exp: sess.exp, p_operation_id: b.operation_id,
    });
    // Duplicate operation cannot return a previously issued secret (only its hash exists).
    if (r.ok !== true) return desktopFail(r.code === 'OPERATION_ALREADY_USED' ? 409 : 403, String(r.code || 'DEVICE_FORBIDDEN'));
    if (r.device_id !== deviceId || typeof r.tugaydi !== 'number' || r.tugaydi <= Date.now()) return desktopFail(502, 'DEVICE_DB_INVALID');
    return Response.json({ ok: true, device_id: deviceId, token, tugaydi: r.tugaydi }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return desktopFail(503, 'DESKTOP_DB_UNAVAILABLE'); }
};
export const onRequestPost = command;
export const onRequestDelete = command;
