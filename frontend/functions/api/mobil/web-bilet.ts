import { sessiyaOl } from '../../_shared/auth';
import { desktopDenyCode, desktopFail, deviceHash, verifiedDesktopDevice, type DesktopEnv } from '../../_shared/desktop-device';
import { biletYarat, biletYolYaroqli, hashSifrla } from '../../_shared/mobil-bilet';

// POST /api/mobil/web-bilet { yol:'/admin/...' } (verified device Bearer) -> { ok, url } one-time (30 s) link for the in-app WebView.
type Env = DesktopEnv;
export const onRequestPost: PagesFunction<Env> = async ctx => {
  const sess = await sessiyaOl(ctx.request, ctx.env);
  if (!sess || !verifiedDesktopDevice(ctx.request) || !Number.isSafeInteger(sess.foydalanuvchi_id) || Number(sess.foydalanuvchi_id) <= 0) return desktopFail(401, desktopDenyCode(ctx.request));
  let b: { yol?: unknown };
  try { b = await ctx.request.json() as { yol?: unknown }; } catch { return desktopFail(400, 'BODY_INVALID'); }
  if (!biletYolYaroqli(b?.yol)) return desktopFail(400, 'YOL_INVALID');
  const dev = verifiedDesktopDevice(ctx.request)!;
  const raw = ctx.request.headers.get('Authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
  if (!raw) return desktopFail(401, 'DEVICE_AUTH_REQUIRED');
  const bilet = await biletYarat({ u: Number(sess.foydalanuvchi_id), r: sess.rol, y: b.yol, d: dev.device_id, h: await hashSifrla(await deviceHash(raw), ctx.env.SESSIYA_KALIT) }, ctx.env.SESSIYA_KALIT);
  const url = new URL('/api/mobil/web-kirish', new URL(ctx.request.url).origin);
  url.searchParams.set('b', bilet);
  return Response.json({ ok: true, url: url.href }, { headers: { 'Cache-Control': 'no-store' } });
};
