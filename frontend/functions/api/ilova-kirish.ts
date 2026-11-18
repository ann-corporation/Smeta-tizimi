/**
 * /api/ilova-kirish — ilova (Android WebView) kirishi tizim brauzeri orqali.
 * POST {amal:'bilet', h}   — brauzerda kirilgan sessiya bilan (cookie): {ok, bilet}. h = sha256(ilova siri), base64url.
 * POST {amal:'almash', bilet, sir} — ilova WebView'ida: bilet + sir to'g'ri bo'lsa sessiya cookie o'rnatiladi.
 */
import { tekshir, SESSIYA_MUDDAT_MS } from '../_shared/auth';
import { biletOch, biletYarat, XESH_RE } from '../_shared/ilova-bilet';

type Env = { SESSIYA_KALIT: string };
const NO = { 'Cache-Control': 'no-store' };

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const origin = ctx.request.headers.get('Origin');
  if (origin && origin !== new URL(ctx.request.url).origin) return Response.json({ ok: false, code: 'ORIGIN' }, { status: 403, headers: NO });
  let b: { amal?: string; h?: string; bilet?: string; sir?: string } = {};
  try { b = await ctx.request.json(); } catch { return Response.json({ ok: false, code: 'SOROV' }, { status: 400, headers: NO }); }
  const secret = ctx.env.SESSIYA_KALIT;
  if (b.amal === 'bilet') {
    const cookie = ctx.request.headers.get('Cookie');
    const sess = await tekshir(cookie, secret);
    const token = cookie?.match(/sess=([^;]+)/)?.[1];
    if (!sess || !token) return Response.json({ ok: false, code: 'AUTH_REQUIRED' }, { status: 401, headers: NO });
    if (!b.h || !XESH_RE.test(b.h)) return Response.json({ ok: false, code: 'SOROV' }, { status: 400, headers: NO });
    return Response.json({ ok: true, bilet: await biletYarat(token, b.h, secret) }, { headers: NO });
  }
  if (b.amal === 'almash') {
    const token = await biletOch(String(b.bilet || ''), String(b.sir || ''), secret);
    if (!token) return Response.json({ ok: false, code: 'BILET_YAROQSIZ' }, { status: 401, headers: NO });
    const sess = await tekshir('sess=' + token, secret);
    if (!sess) return Response.json({ ok: false, code: 'BILET_YAROQSIZ' }, { status: 401, headers: NO });
    const qoldi = Math.max(60, Math.min(Math.floor(SESSIYA_MUDDAT_MS / 1000), Math.floor((sess.exp - Date.now()) / 1000)));
    return Response.json({ ok: true }, { headers: { ...NO, 'Set-Cookie': `sess=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${qoldi}` } });
  }
  return Response.json({ ok: false, code: 'SOROV' }, { status: 400, headers: NO });
};
