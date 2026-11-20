/**
 * POST /api/hujjat-yangila-tick - «Hujjat doim tayyor» ishlovchisi (GitHub Actions: .github/workflows/hujjat-yangila.yml, har 5 daqiqa;
 * qo'shimcha: paket ro'yxati ochilganda `hujjat-maydoni` ushbu ishlovchini fonda ham chaqiradi - GitHub cron kechikishini yopadi).
 * Kirish FAQAT `X-Cron-Kalit` (BILDIRISHNOMA_CRON_KALIT). Ish: backfill (bir marta: so'nggi 3 oy F-2) + muddati kelgan navbat (debounce/retry SQL da).
 * Token YECHILMAYDI. Javob: { backfill, natija: { korildi, yangilandi, otkazildi, xato } }.
 */
import { cronKalitTekshir } from './bildirishnoma-yetkaz';
import { hmRpc } from '../_shared/hujjat-maydoni';
import { haqiqiyDeps, navbatniIshla, type YangilaEnv } from '../_shared/hujjat-yangila';

type Env = YangilaEnv & { BILDIRISHNOMA_CRON_KALIT?: string };

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const k = cronKalitTekshir(ctx.request, ctx.env.BILDIRISHNOMA_CRON_KALIT);
  if (k === 'sozlanmagan') return Response.json({ ok: false, code: 'CRON_SOZLANMAGAN' }, { status: 503 });
  if (k === 'rad') return Response.json({ ok: false, code: 'RAD' }, { status: 403 });
  try {
    const b = await ctx.request.json().catch(() => null) as { limit?: number } | null;
    const bf = await hmRpc(ctx.env, 't2_hujjat_yangila_backfill_v1', { p_oy: 3 });
    const limit = Math.min(Math.max(Number(b?.limit) || 4, 1), 10);
    const natija = await navbatniIshla(haqiqiyDeps(ctx), { limit, byudjetMs: 20_000 });
    if (natija.xato > 0) console.error(JSON.stringify({ hujjat_yangila: 'xato', soni: natija.xato, xatolar: natija.xatolar.slice(0, 5) }));
    return Response.json({ ok: true, backfill: bf.body?.ok ? { qoshildi: bf.body.qoshildi, allaqachon: bf.body.allaqachon === true } : null, natija }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return Response.json({ ok: false, code: 'YANGILA_XATO', xato: String((e as Error)?.message || e).slice(0, 200) }, { status: 500 });
  }
};
