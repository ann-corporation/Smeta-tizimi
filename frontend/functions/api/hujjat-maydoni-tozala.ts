/**
 * POST /api/hujjat-maydoni-tozala - kunlik hisob va tozalash (GitHub Actions: .github/workflows/hujjat-maydoni-kunlik.yml).
 * Kirish FAQAT `X-Cron-Kalit` (BILDIRISHNOMA_CRON_KALIT). Ish:
 *   1. savatda 30 kundan oshgan fayllar va 1 kundan eski 'kutish' versiyalari: R2 dan o'chiriladi, so'ng metama'lumot;
 *   2. t2_hm_hisobla_v1: ortiqcha xotira/trafik tokenda (idempotent, sana bo'yicha) + 80%/95% ogohlantirish.
 * Token yetmasa fayllar O'CHIRILMAYDI (faqat 'yetmadi' belgisi) - foydalanuvchi ma'lumoti garovga olinmaydi.
 */
import { cronKalitTekshir } from './bildirishnoma-yetkaz';
import { hmRpc, type HmEnv } from '../_shared/hujjat-maydoni';
import { r2Ochir } from '../_shared/r2-saqlash';

type Env = HmEnv & { BILDIRISHNOMA_CRON_KALIT?: string };

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const k = cronKalitTekshir(ctx.request, ctx.env.BILDIRISHNOMA_CRON_KALIT);
  if (k === 'sozlanmagan') return Response.json({ ok: false, code: 'CRON_SOZLANMAGAN' }, { status: 503 });
  if (k === 'rad') return Response.json({ ok: false, code: 'RAD' }, { status: 403 });
  try {
    const n = await hmRpc(ctx.env, 't2_hm_tozala_ol_v1', { p_actor: null, p_fayl_id: null, p_limit: 100 });
    let tozalandi = { fayllar: 0, versiyalar: 0 };
    if (n.httpOk && n.body?.ok) {
      const fayllar: Array<{ id: number; kalitlar: string[] }> = n.body.fayllar || [];
      const versiyalar: Array<{ id: number; kalit: string }> = n.body.versiyalar || [];
      for (const f of fayllar) for (const kalit of f.kalitlar || []) await r2Ochir(ctx.env.R2_CANONICAL, kalit);
      for (const v of versiyalar) await r2Ochir(ctx.env.R2_CANONICAL, v.kalit);
      if (fayllar.length || versiyalar.length) {
        await hmRpc(ctx.env, 't2_hm_tozala_tasdiq_v1', { p_fayl_idlar: fayllar.map((f) => f.id), p_versiya_idlar: versiyalar.map((v) => v.id), p_eski_idlar: [] });
      }
      tozalandi = { fayllar: fayllar.length, versiyalar: versiyalar.length };
    }
    const h = await hmRpc(ctx.env, 't2_hm_hisobla_v1', { p_sana: new Date().toISOString().slice(0, 10) });
    return Response.json({ ok: true, tozalandi, hisob: h.body?.ok ? { hisoblandi: h.body.hisoblandi, ogohlantirish: h.body.ogohlantirish } : null }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e: any) {
    return Response.json({ ok: false, code: 'HM_XATO', xato: String(e?.message || e).slice(0, 200) }, { status: 500 });
  }
};
