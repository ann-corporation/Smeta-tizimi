import type { DesktopEnv } from '../../_shared/desktop-device';
import { biletIshlat, biletTekshir, webCookie } from '../../_shared/mobil-bilet';

// GET /api/mobil/web-kirish?b=<bilet> (called by the in-app WebView only): ticket -> short-lived web cookie -> redirect to the ticket's /admin path.
type Env = DesktopEnv & { MOBIL_BILET_BIR_MARTALIK?: string };
const yopiq = (status: number) => new Response(status === 400 ? 'Bad request' : 'Link expired', { status, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });

export const onRequestGet: PagesFunction<Env> = async ctx => {
  const url = new URL(ctx.request.url);
  const bilet = url.searchParams.get('b') ?? '';
  const p = bilet ? await biletTekshir(bilet, ctx.env.SESSIYA_KALIT).catch(() => null) : null;
  if (!p) return yopiq(p === null && bilet ? 410 : 400);
  // Single use: a replayed ticket (same nonce) is refused. The cookie is device-bound (re-verified on every request by api/_middleware.ts),
  // 2 h sliding, so revoking the device also ends the WebView session.
  if (!await biletIshlat(p, ctx.env)) return yopiq(410);
  const cookie = await webCookie({ rol: p.r, u: p.u, d: p.d, wh: p.h, wi: Date.now() }, ctx.env.SESSIYA_KALIT);
  return new Response(null, { status: 302, headers: {
    Location: p.y, 'Set-Cookie': cookie,
    'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
  } });
};