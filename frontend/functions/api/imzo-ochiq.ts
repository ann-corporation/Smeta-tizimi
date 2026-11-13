/**
 * /api/imzo-ochiq - OCHIQ imzo tekshiruvi (KIRMASDAN, faqat GET). QR dagi `/t/<token>` sahifasi shuni chaqiradi.
 *
 *   GET ?token=<22 belgi>  -> { ok, hujjat:{turi,tahrir,sana,kompaniya}, imzolar:[{imzolovchi,rol,vaqt,holat,...}], joriy }
 *
 * Maxfiylik: SUMMA, fayl nomi, R2 kaliti, ochiq kalit, imzo baytlari, foydalanuvchi/hujjat id QAYTMAYDI (faqat tekshirilgan natija).
 * Token topilmasa yoki shakli noto'g'ri bo'lsa - har doim BIR XIL 404 javob. Tezlik cheklovi: IP bo'yicha 30/daqiqa (isolate xotirasi;
 * qo'shimcha qatlam - Cloudflare WAF qoidasi, ADR). no-store: holat har so'rovda yangidan tekshiriladi.
 */
import { imzoKorinish, imzoRpc, tezlikOmbori, zanjirTekshir, type ImzoEnv, type ImzoXom } from '../_shared/imzo';
import { hexMi, tokenMi } from '../../src/lib/imzo/yadro';

const NO_STORE = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
export const ochiqUrinish = tezlikOmbori();
const TOPILMADI = () => Response.json({ ok: false, code: 'TOPILMADI' }, { status: 404, headers: NO_STORE });

export const onRequestGet: PagesFunction<ImzoEnv> = async (ctx) => {
  const ip = ctx.request.headers.get('CF-Connecting-IP') || 'noma\'lum';
  if (ochiqUrinish.oshdi('o:' + ip, 30, 60_000)) return Response.json({ ok: false, code: 'KOP_URINISH' }, { status: 429, headers: { ...NO_STORE, 'Retry-After': '60' } });
  const token = new URL(ctx.request.url).searchParams.get('token');
  if (!tokenMi(token)) return TOPILMADI();
  const j = await imzoRpc(ctx.env, 't2_imzo_ochiq_v1', { p_token: token });
  if (!j) return Response.json({ ok: false, code: 'SERVER_XATO' }, { status: 500, headers: NO_STORE });
  if (j.code === 'SERVER_YANGILANMAGAN') return Response.json({ ok: false, code: 'SERVER_YANGILANMAGAN' }, { status: 503, headers: NO_STORE });
  if (!j.ok || !Array.isArray(j.imzolar)) {
    // imzo tokeni emas - eksport nashri (manba QR) tokenimi?
    const n = await imzoRpc(ctx.env, 't2_nashr_ochiq_v1', { p_token: token });
    if (!n?.ok || !Array.isArray(n.imzolar)) return TOPILMADI();
    const xn = n.imzolar as ImzoXom[];
    const nn = await zanjirTekshir(xn, xn.length >= 50);
    const s = (n.nashr ?? {}) as Record<string, unknown>;
    return Response.json({
      ok: true, tur: 'nashr',
      nashr: { turi: s.turi ?? null, sana: s.sana ?? null, kompaniya: s.kompaniya ?? null, mazmun_xesh: hexMi(s.mazmun_xesh) ? s.mazmun_xesh : null, joriy: s.joriy === true, joriy_token: tokenMi(s.joriy_token) ? s.joriy_token : null },
      imzolar: xn.map((q, i) => imzoKorinish(q, nn[i], false)),
    }, { headers: NO_STORE });
  }
  const x = j.imzolar as ImzoXom[];
  const n = await zanjirTekshir(x, x.length >= 50);
  const h = (j.hujjat ?? {}) as Record<string, unknown>;
  return Response.json({
    ok: true, tur: 'imzo',
    hujjat: { turi: h.turi ?? null, tahrir: h.tahrir ?? null, sana: h.sana ?? null, kompaniya: h.kompaniya ?? null },
    imzolar: x.map((q, i) => ({ ...imzoKorinish(q, n[i], false), joriy: q.token === token })),
  }, { headers: NO_STORE });
};