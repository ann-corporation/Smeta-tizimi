/**
 * GET /api/desktop/yangilanish — any signed-in web user: is the Windows app available to me, which installer
 * version is current, where to download it (URL is set by the platform superadmin in «Tizim nazorati → Desktop»;
 * no binaries live in the repository). Read-only, no credentials, no other users' data.
 */
import { tekshir } from '../../_shared/auth';
import { desktopFail, desktopRpc, positiveId, type DesktopEnv } from '../../_shared/desktop-device';

export const onRequestGet: PagesFunction<DesktopEnv> = async ctx => {
  const sess = await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT);
  if (!sess || !positiveId(sess.foydalanuvchi_id)) return desktopFail(401, 'AUTH_REQUIRED');
  try {
    const r = await desktopRpc(ctx.env, 't2_desktop_yangilanish_v1', { p_actor_id: sess.foydalanuvchi_id });
    if (r.ok !== true) return desktopFail(r.code === 'AUTH_REQUIRED' ? 401 : 400, String(r.code || 'DESKTOP_INFO_FAILED'));
    return Response.json(r, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return desktopFail(503, 'DESKTOP_DB_UNAVAILABLE'); }
};
