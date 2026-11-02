/**
 * POST /api/telegram/miniapp { initData } — Telegram Mini App orqali kirish (egasi 2026-10-28, PR 1).
 *
 * initData imzosi va auth_date yangiligi SERVERDA tekshiriladi (_shared/telegram.ts). Bog'langan Telegram → o'sha
 * t2_foydalanuvchi uchun ODDIY sessiya cookie (email/Google kirish bilan bir xil `imzola`). Keyingi har so'rovda
 * vakolat t2_men_v1 + middleware dan olinadi — Telegram uchun alohida ruxsat yo'q. Ulanmagan → 403 ULANMAGAN.
 */
import { imzola, SESSIYA_MUDDAT_MS, type Rol } from '../../_shared/auth';
import { type TgEnv, initDataTekshir, tgRpc, tokenBormi } from '../../_shared/telegram';

const json = (b: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(b, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
const originYaroqsiz = (req: Request) => {
  const origin = req.headers.get('Origin');
  return req.headers.get('Sec-Fetch-Site') === 'cross-site' || (!!origin && origin !== new URL(req.url).origin);
};

type Kirish = { ok?: boolean; code?: string; foydalanuvchi_id?: number; login?: string; rol?: string; azoliklar?: { kompaniya_id: number; rol: string }[] };

export const onRequestPost: PagesFunction<TgEnv> = async (ctx) => {
  const env = ctx.env;
  if (originYaroqsiz(ctx.request)) return json({ ok: false, code: 'ORIGIN_INVALID' }, 403);
  if (!tokenBormi(env) || !env.SUPABASE_URL || !env.SUPABASE_KEY || String(env.SESSIYA_KALIT || '').trim().length < 16)
    return json({ ok: false, code: 'SOZLANMAGAN', xabar: 'Telegram bot hali sozlanmagan.' }, 503);
  let b: { initData?: unknown } = {};
  try { b = await ctx.request.json(); } catch { return json({ ok: false, code: 'BODY_INVALID' }, 400); }
  const v = await initDataTekshir(typeof b.initData === 'string' ? b.initData : '', String(env.TELEGRAM_BOT_TOKEN).trim());
  if (!v.ok) return json({ ok: false, code: 'INIT_DATA_' + v.sabab, xabar: 'Telegram ma’lumoti tasdiqlanmadi. Mini App ni qayta oching.' }, 401);
  const d = await tgRpc<Kirish>(env, 't2_telegram_kirish_v1', { p_telegram_user_id: v.user.id, p_operation_id: crypto.randomUUID() });
  if (!d) return json({ ok: false, code: 'SERVER_XATO', xabar: 'Server bilan aloqa yo‘q.' }, 502);
  if (d.code === 'ULANMAGAN') return json({ ok: false, code: 'ULANMAGAN', xabar: 'Telegram hali hisobingizga ulanmagan.' }, 403);
  if (d.code === 'LIMIT') return json({ ok: false, code: 'LIMIT', xabar: 'Juda ko‘p urinish. Birozdan keyin qayta oching.' }, 429);
  if (!d.ok || !d.foydalanuvchi_id || !d.login || !d.rol) return json({ ok: false, code: d.code || 'KIRISH_RAD', xabar: 'Kirib bo‘lmadi.' }, 403);
  let sess: string;
  try { sess = await imzola({ rol: d.rol as Rol, email: d.login, foydalanuvchi_id: d.foydalanuvchi_id, kompaniyalar: d.azoliklar || [] }, String(env.SESSIYA_KALIT)); }
  catch { return json({ ok: false, code: 'CONFIG' }, 503); }
  return json({ ok: true, rol: d.rol }, 200,
    { 'Set-Cookie': `sess=${sess}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${Math.floor(SESSIYA_MUDDAT_MS / 1000)}` });
};
