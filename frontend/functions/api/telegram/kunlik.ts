/**
 * POST /api/telegram/kunlik — kunlik xulosani (opt-in: /kunlik on) Telegram'ga yuborish (fon ishi; GitHub Actions kuniga bir marta,
 * workflow .github/workflows/telegram-kunlik.yml; migratsiya 20261223000000 qo'llangandan keyin).
 *
 *  • Kirish FAQAT `X-Cron-Kalit` (BILDIRISHNOMA_CRON_KALIT, kamida 24 belgi) — bildirishnoma-yetkaz bilan bir xil sir; sozlanmagan → 503, noto'g'ri → 403.
 *  • Partiyalab: har chaqiruvda ≤ 4 foydalanuvchi (Cloudflare tashqi so'rov byudjeti); javobda `keyingi` — workflow shu `keyin_id` bilan davom etadi.
 *  • Xulosa mazmuni /bugun bilan bir xil (o'qish, mavjud shlyuzlar + ruxsat qatlami orqali). Rozilik (kunlik=true) t2_telegram_manzil_v1 da qayta tekshiriladi.
 *  • Javobda faqat sonlar; matn, chat_id, token loglanmaydi.
 */
import { type TgEnv, tgRpc, tgT, tokenBormi, xabarYubor } from '../../_shared/telegram';
import { bugunJavobi } from '../../_shared/telegram-bot';
import { cronKalitTekshir } from '../bildirishnoma-yetkaz';

type Env = TgEnv & { BILDIRISHNOMA_CRON_KALIT?: string };
export const KUNLIK_PARTIYA = 4;
const javob = (d: unknown, status = 200) => Response.json(d, { status, headers: { 'Cache-Control': 'no-store' } });

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const env = ctx.env;
  const k = cronKalitTekshir(ctx.request, env.BILDIRISHNOMA_CRON_KALIT);
  if (k === 'sozlanmagan') return javob({ ok: false, code: 'SOZLANMAGAN' }, 503);
  if (k === 'rad') return javob({ ok: false, code: 'RAD' }, 403);
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return javob({ ok: false, code: 'SERVER_SOZLANMAGAN' }, 503);
  if (!tokenBormi(env)) return javob({ ok: true, telegram: false, olindi: 0 });
  let b: { keyin_id?: unknown } = {};
  try { b = await ctx.request.json(); } catch { b = {}; }
  const keyin = Number.isSafeInteger(Number(b.keyin_id)) && Number(b.keyin_id) > 0 ? Number(b.keyin_id) : 0;

  const l = await tgRpc<{ ok?: boolean; foydalanuvchilar?: number[]; keyingi?: number | null }>(env, 't2_telegram_kunlik_royxat_v1', { p_limit: KUNLIK_PARTIYA, p_keyin_id: keyin });
  if (!l?.ok || !Array.isArray(l.foydalanuvchilar)) return javob({ ok: false, code: 'ROYXAT_XATO' }, 502);

  let yuborildi = 0; let otkazildi = 0;
  for (const uid of l.foydalanuvchilar.filter((x) => Number.isSafeInteger(x) && x > 0).slice(0, KUNLIK_PARTIYA)) {
    const m = await tgRpc<{ ok?: boolean; yuborish?: boolean; chat_id?: number; til?: 'uz' | 'ru' | 'en' | null }>(env, 't2_telegram_manzil_v1', { p_foydalanuvchi_id: uid, p_tur: 'kunlik' });
    if (!m?.ok || !m.yuborish || !Number.isSafeInteger(m.chat_id)) { otkazildi++; continue; }
    const til = m.til === 'ru' || m.til === 'en' ? m.til : 'uz';
    const j = await bugunJavobi(env, uid, til);
    const ok = await xabarYubor(env, m.chat_id as number, tgT('Xayrli tong!', til) + '\n' + j.matn, j.markup ? { reply_markup: j.markup } : {});
    if (ok) yuborildi++; else otkazildi++;
  }
  return javob({ ok: true, telegram: true, yuborildi, otkazildi, keyingi: l.keyingi ?? null });
};
