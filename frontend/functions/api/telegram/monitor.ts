/**
 * POST /api/telegram/monitor — egasiga Telegram ogohlantirish: baza hajmi chegaradan oshsa (fon ishi; GitHub Actions
 * .github/workflows/monitor.yml, har 15 daqiqada, hajm tekshiruvi `db:true` bilan kuniga 4 marta).
 *
 *  • Kirish FAQAT `X-Cron-Kalit` (BILDIRISHNOMA_CRON_KALIT, mavjud sir) — sozlanmagan → 503, noto'g'ri → 403.
 *  • Egasi: Cloudflare o'zgaruvchisi MONITOR_EGASI_ID (superadmin foydalanuvchi raqami; sir emas). Egasining Telegram chati
 *    mavjud t2_telegram_manzil_v1 orqali olinadi (bot ulangan bo'lishi kerak).
 *  • Chegara: MONITOR_DB_FOIZ (standart 85) × DB_LIMIT_MB (standart 500 — Supabase Free). Javobda faqat sonlar/kod.
 *  • Sayt o'chganda bu endpoint ham ishlamaydi — buni workflow o'zi (sirli TELEGRAM_ALERT_* orqali yoki GitHub xati bilan) xabar qiladi.
 */
import { type TgEnv, tgRpc, tgT, tokenBormi, xabarYubor } from '../../_shared/telegram';
import { supabaseBaseUrl } from '../../_shared/supabase-url';
import { cronKalitTekshir } from '../bildirishnoma-yetkaz';

type Env = TgEnv & { BILDIRISHNOMA_CRON_KALIT?: string; MONITOR_EGASI_ID?: string; DB_LIMIT_MB?: string; MONITOR_DB_FOIZ?: string; MONITOR_SNAP_MB?: string };
const MB = 1024 * 1024;
const javob = (d: unknown, status = 200) => Response.json(d, { status, headers: { 'Cache-Control': 'no-store' } });

/** Issiq (R2 ga sovutilmagan) snapshot hajmi chegarasi, MB (standart 60; sovutish cron to'xtasa shu o'sadi). */
export const SNAP_ISSIQ_STANDART_MB = 60;
export function snapBaho(issiqBayt: number, chegaraMb: unknown): { mb: number; ogoh: boolean } {
  const ch = Number(chegaraMb); const lim = Number.isFinite(ch) && ch > 0 ? ch : SNAP_ISSIQ_STANDART_MB;
  const mb = Math.round(issiqBayt / MB * 10) / 10;
  return { mb, ogoh: Number.isFinite(mb) && mb >= lim };
}

/** Sof: hajm foizi va ogohlantirish kerakmi. */
export function hajmBaho(dbBytes: number, limitMb: unknown, chegaraFoiz: unknown): { foiz: number; ogoh: boolean } {
  const lim = Number(limitMb); const ch = Number(chegaraFoiz);
  const limitBytes = (Number.isFinite(lim) && lim > 0 ? lim : 500) * MB;
  const chegara = Number.isFinite(ch) && ch > 0 && ch <= 100 ? ch : 85;
  const foiz = Math.round((dbBytes / limitBytes) * 1000) / 10;
  return { foiz, ogoh: foiz >= chegara };
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const env = ctx.env;
  const k = cronKalitTekshir(ctx.request, env.BILDIRISHNOMA_CRON_KALIT);
  if (k === 'sozlanmagan') return javob({ ok: false, code: 'SOZLANMAGAN' }, 503);
  if (k === 'rad') return javob({ ok: false, code: 'RAD' }, 403);
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return javob({ ok: false, code: 'SERVER_SOZLANMAGAN' }, 503);
  const egasi = Number(env.MONITOR_EGASI_ID);
  if (!Number.isSafeInteger(egasi) || egasi <= 0) return javob({ ok: false, code: 'EGASI_SOZLANMAGAN' }, 503);
  let b: { db?: unknown } = {};
  try { b = await ctx.request.json(); } catch { b = {}; }
  if (b.db !== true) return javob({ ok: true, tekshirildi: false });

  let dbBytes = NaN; let issiqBayt = NaN;
  try {
    const r = await fetch(supabaseBaseUrl(env.SUPABASE_URL) + '/rest/v1/rpc/t2_db_hajm_v1', {
      method: 'POST', headers: { apikey: env.SUPABASE_KEY, Authorization: 'Bearer ' + env.SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_actor_id: egasi }),
    });
    const j = (r.ok ? await r.json().catch(() => null) : null) as { ok?: boolean; db_bytes?: number; snapshot_sovuq?: { issiq_bayt?: number } } | null;
    if (j?.ok === true) { dbBytes = Number(j.db_bytes); issiqBayt = Number(j.snapshot_sovuq?.issiq_bayt); }
  } catch { /* quyida */ }
  if (!Number.isFinite(dbBytes)) return javob({ ok: false, code: 'HAJM_OLINMADI' }, 502);

  const { foiz, ogoh } = hajmBaho(dbBytes, env.DB_LIMIT_MB, env.MONITOR_DB_FOIZ);
  const snap = Number.isFinite(issiqBayt) ? snapBaho(issiqBayt, env.MONITOR_SNAP_MB) : null;
  const snapOgoh = snap?.ogoh === true;
  if (!ogoh && !snapOgoh) return javob({ ok: true, foiz, ogoh: false, snapshot_issiq_mb: snap?.mb ?? null });
  if (!tokenBormi(env)) return javob({ ok: true, foiz, ogoh: true, snapshot_ogoh: snapOgoh, snapshot_issiq_mb: snap?.mb ?? null, telegram: false });
  const m = await tgRpc<{ ok?: boolean; yuborish?: boolean; chat_id?: number }>(env, 't2_telegram_manzil_v1', { p_foydalanuvchi_id: egasi, p_tur: 'signal' });
  if (!m?.ok || !m.yuborish || !Number.isSafeInteger(m.chat_id)) return javob({ ok: true, foiz, ogoh: true, snapshot_ogoh: snapOgoh, telegram: false });
  const matn = [ogoh ? tgT('Ogohlantirish: baza hajmi {foiz}% (chegara). Supabase rejasini tekshiring.', 'uz', { foiz }) : null, snapOgoh ? tgT('Ogohlantirish: bazada issiq snapshot {mb} MB (sovutish cron tekshirilsin).', 'uz', { mb: snap?.mb ?? 0 }) : null].filter(Boolean).join('\n');
  const yuborildi = await xabarYubor(env, m.chat_id as number, matn);
  return javob({ ok: true, foiz, ogoh, snapshot_ogoh: snapOgoh, snapshot_issiq_mb: snap?.mb ?? null, telegram: true, yuborildi });
};
