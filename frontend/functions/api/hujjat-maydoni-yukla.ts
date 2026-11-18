/**
 * hujjat-maydoni-yukla.ts - Hujjat maydoniga yuklash (ikki bosqichli, kvota SERVERDA majburan tekshiriladi).
 *   1. RPC t2_hm_yuklash_reserve_v1  -> ruxsat + kvota + versiya raqami + R2 kaliti (limitdan oshsa KVOTA_TUGADI - R2 ga hech narsa yozilmaydi)
 *   2. baytlar -> r2Yoz (yagona R2 yozuv nuqtasi)
 *   3. RPC t2_hm_yuklash_tasdiq_v1   (R2 xato bersa t2_hm_yuklash_bekor_v1 - kutish qatori va kvota qaytadi)
 * Bir xil nomdagi fayl yuklansa - yangi versiya. Bir xil mazmun (sha256) - 'ozgarmadi'.
 *
 * multipart/form-data: fayl, kompaniya_id (bo'sh = shaxsiy), papka_id?, fayl_id? (aniq faylning yangi versiyasi), operation_id (uuid), sha256 (hex)
 * Mijoz sha256/hajmiga ishonilmaydi: server baytlarni o'zi o'qib hisoblaydi.
 */
import { HM_MAX_BAYT, hmYukla, sessiyaAktor, type HmEnv } from '../_shared/hujjat-maydoni';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const onRequestPost: PagesFunction<HmEnv> = async (ctx) => {
  try {
    const a = await sessiyaAktor(ctx);
    if (a instanceof Response) return a;
    if (!ctx.env.R2_CANONICAL) return Response.json({ ok: false, code: 'CONFIG', xato: 'R2_CANONICAL binding yo‘q' }, { status: 500 });
    const declared = Number(ctx.request.headers.get('Content-Length') || 0);
    if (declared > HM_MAX_BAYT + 1024 * 1024) return Response.json({ ok: false, code: 'FILE_TOO_LARGE', xato: 'Fayl juda katta.' }, { status: 413 });
    const form = await ctx.request.formData();
    const file = form.get('fayl') as unknown as File | null;
    const op = String(form.get('operation_id') || '').trim();
    if (!file || typeof file.arrayBuffer !== 'function') return Response.json({ ok: false, code: 'FAYL_KERAK' }, { status: 400 });
    if (!UUID.test(op)) return Response.json({ ok: false, code: 'OPERATION_ID_REQUIRED', xato: 'UUID operation_id majburiy' }, { status: 400 });
    if (file.size > HM_MAX_BAYT) return Response.json({ ok: false, code: 'FILE_TOO_LARGE', xato: 'Fayl juda katta.' }, { status: 413 });
    const n = (k: string) => { const v = Number(form.get(k)); return Number.isFinite(v) && v > 0 ? v : null; };
    const bayt = new Uint8Array(await file.arrayBuffer());
    return await hmYukla(ctx.env, {
      actorId: a.actorId, kompaniyaId: n('kompaniya_id'), papkaId: n('papka_id'), faylId: n('fayl_id'),
      nom: (file as File).name, mime: (file as File).type, bayt, operationId: op,
    });
  } catch (e: any) {
    return Response.json({ ok: false, code: 'HM_XATO', xato: String(e?.message || e).slice(0, 200) }, { status: 500 });
  }
};
