import { imzola, SESSIYA_MUDDAT_MS, type Rol } from '../../_shared/auth';
import type { DesktopEnv } from '../../_shared/desktop-device';
import { biletTekshir, WEB_SESSIYA_MS } from '../../_shared/mobil-bilet';

// GET /api/mobil/web-kirish?b=<bilet> (called by the in-app WebView only): ticket -> short-lived web cookie -> redirect to the ticket's /admin path.
type Env = DesktopEnv;
const yopiq = (status: number) => new Response(status === 400 ? 'Bad request' : 'Link expired', { status, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });

export const onRequestGet: PagesFunction<Env> = async ctx => {
  const url = new URL(ctx.request.url);
  const bilet = url.searchParams.get('b') ?? '';
  const p = bilet ? await biletTekshir(bilet, ctx.env.SESSIYA_KALIT).catch(() => null) : null;
  if (!p) return yopiq(p === null && bilet ? 410 : 400);
  // exp = now + 8 h (the 90-day default is shortened on purpose: this cookie is not tied to the device and cannot be revoked with it).
  const cookie = await imzola({ rol: p.r as Rol, foydalanuvchi_id: p.u }, ctx.env.SESSIYA_KALIT, Date.now() - SESSIYA_MUDDAT_MS + WEB_SESSIYA_MS);
  return new Response(null, { status: 302, headers: {
    Location: p.y,
    'Set-Cookie': `sess=${cookie}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${WEB_SESSIYA_MS / 1000}`,
    'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
  } });
};
