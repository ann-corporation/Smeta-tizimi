/**
 * POST /api/chiqish — tizimdan HAQIQIY chiqish (2026-10-20).
 * Sessiya cookie `HttpOnly` — uni brauzerdagi JavaScript o'chira olmaydi; avval «Chiqish» faqat `document.cookie` ni
 * tozalashga urinardi va sessiya 90 kun amal qilaverardi. Cookie faqat server javobi bilan o'chiriladi.
 * Sessiyasiz ham ishlaydi (eskirgan cookie ham tozalanadi). Ma'lumot o'qimaydi va yozmaydi.
 */
const TOZALASH = 'sess=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0';

export const onRequestPost: PagesFunction = async (ctx) => {
  const origin = ctx.request.headers.get('Origin');
  if (ctx.request.headers.get('Sec-Fetch-Site') === 'cross-site' || (origin && origin !== new URL(ctx.request.url).origin)) {
    return Response.json({ ok: false, code: 'ORIGIN_INVALID' }, { status: 403 });
  }
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': TOZALASH, 'Cache-Control': 'no-store', 'Clear-Site-Data': '"cookies"' } });
};
