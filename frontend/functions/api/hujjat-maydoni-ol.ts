/**
 * hujjat-maydoni-ol.ts - Hujjat maydoni fayllarini yuklab olish (R2, proksi; ruxsat RPC da).
 *   GET /api/hujjat-maydoni-ol?id=<fayl_id>[&v=<versiya>][&korish=1]   (sessiya; o'z fayllari BEPUL)
 *   GET /api/hujjat-maydoni-ol?t=<token>                                (tashqi havola: faqat ko'rish, muddatli, kompaniya yoqqan bo'lsa)
 * Kvota to'lganda ham yuklab olish ISHLAYDI (foydalanuvchi ma'lumoti garovga olinmaydi); trafik t2_hm_yuklab_v1 ichida hisoblanadi.
 */
import { hmRpc, rpcOk, rpcXato, sessiyaAktor, yuklashSarlavha, type HmEnv } from '../_shared/hujjat-maydoni';
import { r2Oqi, sha256Hex } from '../_shared/r2-saqlash';

export const onRequestGet: PagesFunction<HmEnv> = async (ctx) => {
  try {
    const q = new URL(ctx.request.url).searchParams;
    const token = q.get('t');
    let res;
    if (token) {
      if (!/^[0-9a-f]{64}$/.test(token)) return Response.json({ ok: false, code: 'HAVOLA_YOQ', xato: 'Havola yaroqsiz yoki muddati tugagan.' }, { status: 404 });
      res = await hmRpc(ctx.env, 't2_hm_havola_ol_v1', { p_xesh: await sha256Hex(new TextEncoder().encode(token)) });
    } else {
      const a = await sessiyaAktor(ctx);
      if (a instanceof Response) return a;
      const id = Number(q.get('id'));
      if (!id) return Response.json({ ok: false, code: 'FAYL_TOPILMADI' }, { status: 400 });
      const v = Number(q.get('v'));
      res = await hmRpc(ctx.env, 't2_hm_yuklab_v1', { p_actor: a.actorId, p_fayl_id: id, p_raqam: v > 0 ? v : null });
    }
    if (!rpcOk(res)) return rpcXato(res);
    const obj = await r2Oqi(ctx.env.R2_CANONICAL, String(res.body.kalit));
    if (!obj) return Response.json({ ok: false, code: 'CANONICAL_BINARY_MISSING' }, { status: 502 });
    const h = yuklashSarlavha(String(res.body.nom), String(res.body.mime), Number(res.body.bayt) || 0, q.get('korish') === '1');
    h.set('X-Canonical-Sha256', String(res.body.sha256 || ''));
    return new Response(obj.body, { headers: h });
  } catch (e: any) {
    return Response.json({ ok: false, code: 'DOWNLOAD_FAILED', xato: String(e?.message || e).slice(0, 200) }, { status: 500 });
  }
};
