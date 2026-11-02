/**
 * /api/telegram — kirgan foydalanuvchi uchun Telegram ulash va superadmin bot boshqaruvi (egasi 2026-10-28, PR 1).
 *
 * GET                                  → { ok, sozlangan, bot, ulangan, ulandi_at?, bildirishnoma? }
 * POST { amal:'kod' }                  → bir martalik kod (10 daq) → { ok, havola, tugaydi }   (kod bazada faqat xesh)
 * POST { amal:'uz' }                   → web tomonidan uzish (+ botga xabar)
 * POST { amal:'sozlama', bildirishnoma:{ topshiriq:boolean } }
 * POST { amal:'admin_holat' }          → SUPERADMIN: getWebhookInfo + getMe + statistika (tokensiz)
 * POST { amal:'admin_ornat' }          → SUPERADMIN: setWebhook (secret_token bilan) + setChatMenuButton + setMyCommands
 *
 * Actor HAR DOIM sessiyadan + yangi DB vakolati (roleAuthority: bekor qilingan/faol emas sessiya rad). Superadmin —
 * har chaqiruvda bazada qayta tekshiriladi (superadminActor). Token/sir hech qachon javobga chiqmaydi.
 */
import { tekshir } from '../../_shared/auth';
import { roleAuthority, sessiyaYaroqsizmi, yaroqsizSessiyaJavob } from '../../_shared/role-authority';
import { superadminActor } from '../../_shared/superadmin';
import {
  type TgEnv, botNomi, deepLink, miniAppUrl, saytUrl, tgApi, tgRpc, tgT, tokenBormi, ulashKodXesh, ulashKodYarat, xabarYubor,
} from '../../_shared/telegram';

type Env = TgEnv & { SUPABASE_URL: string; SUPABASE_KEY: string; SESSIYA_KALIT: string };
const json = (b: unknown, status = 200) => Response.json(b, { status, headers: { 'Cache-Control': 'no-store' } });
const originYaroqsiz = (req: Request) => {
  const origin = req.headers.get('Origin');
  return req.headers.get('Sec-Fetch-Site') === 'cross-site' || (!!origin && origin !== new URL(req.url).origin);
};

async function actor(req: Request, env: Env): Promise<number | Response> {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return json({ ok: false, code: 'SOZLANMAGAN' }, 503);
  const s = await tekshir(req.headers.get('Cookie'), env.SESSIYA_KALIT).catch(() => null);
  if (!s || !Number.isSafeInteger(s.foydalanuvchi_id) || Number(s.foydalanuvchi_id) <= 0) return json({ ok: false, code: 'AUTH_REQUIRED' }, 401);
  const a = await roleAuthority(s, env);
  if (!a && sessiyaYaroqsizmi(s)) return yaroqsizSessiyaJavob();
  if (!a) return json({ ok: false, code: 'AUTHORITY_UNAVAILABLE' }, 503);
  return Number(s.foydalanuvchi_id);
}

export const BUYRUQLAR: Record<'uz' | 'ru' | 'en', { command: string; description: string }[]> = (['uz', 'ru', 'en'] as const).reduce((acc, til) => {
  acc[til] = [
    { command: 'ilova', description: tgT('tizimni Telegram ichida ochish', til) },
    { command: 'men', description: tgT('men kimman (hisob, kompaniya, rol)', til) },
    { command: 'yordam', description: tgT('shu ro‘yxat', til) },
    { command: 'chiqish', description: tgT('Telegramni hisobdan uzish', til) },
  ];
  return acc;
}, {} as Record<'uz' | 'ru' | 'en', { command: string; description: string }[]>);

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const a = await actor(ctx.request, ctx.env); if (a instanceof Response) return a;
  const h = await tgRpc<{ ok?: boolean; ulangan?: boolean; ulandi_at?: string; bildirishnoma?: Record<string, boolean> }>(ctx.env, 't2_telegram_holat_v1', { p_actor_id: a });
  if (!h?.ok) return json({ ok: false, code: 'SERVER_XATO' }, 502);
  return json({ ok: true, sozlangan: tokenBormi(ctx.env), bot: botNomi(ctx.env), ulangan: !!h.ulangan, ulandi_at: h.ulandi_at ?? null, bildirishnoma: h.bildirishnoma ?? null });
};

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const { env, request } = ctx;
  if (originYaroqsiz(request)) return json({ ok: false, code: 'ORIGIN_INVALID' }, 403);
  let b: { amal?: string; bildirishnoma?: unknown } = {};
  try { b = await request.json(); } catch { return json({ ok: false, code: 'BODY_INVALID' }, 400); }

  if (b.amal === 'admin_holat' || b.amal === 'admin_ornat') {
    const s = await superadminActor(request, env);
    if ('code' in s) return json({ ok: false, code: s.code }, s.status);
    if (!tokenBormi(env)) return json({ ok: true, sozlangan: false, sir_sozlangan: String(env.TELEGRAM_WEBHOOK_SECRET || '').trim().length >= 16 });
    const kutilganUrl = saytUrl(env) + '/api/telegram/webhook';
    if (b.amal === 'admin_ornat') {
      const sir = String(env.TELEGRAM_WEBHOOK_SECRET || '').trim();
      if (sir.length < 16 || !/^[A-Za-z0-9_-]{16,256}$/.test(sir)) return json({ ok: false, code: 'WEBHOOK_SIR_YOQ', xabar: 'TELEGRAM_WEBHOOK_SECRET (16+ belgi, A-Z a-z 0-9 _ -) o‘rnatilmagan.' }, 400);
      const w = await tgApi(env, 'setWebhook', { url: kutilganUrl, secret_token: sir, allowed_updates: ['message', 'callback_query'], max_connections: 20 });
      const mb = await tgApi(env, 'setChatMenuButton', { menu_button: { type: 'web_app', text: 'Smeta', web_app: { url: miniAppUrl(env) } } });
      const cmd = await Promise.all([
        tgApi(env, 'setMyCommands', { commands: BUYRUQLAR.uz }),
        tgApi(env, 'setMyCommands', { commands: BUYRUQLAR.ru, language_code: 'ru' }),
        tgApi(env, 'setMyCommands', { commands: BUYRUQLAR.en, language_code: 'en' }),
      ]);
      return json({ ok: w.ok && mb.ok, code: w.ok && mb.ok ? undefined : 'TELEGRAM_RAD', webhook_xato: w.ok ? null : (w.description ?? null), menyu_xato: mb.ok ? null : (mb.description ?? null), buyruqlar: cmd.every((c) => c.ok) });
    }
    const [info, me, stat] = await Promise.all([
      tgApi<{ url?: string; pending_update_count?: number; last_error_date?: number; last_error_message?: string }>(env, 'getWebhookInfo', {}),
      tgApi<{ username?: string }>(env, 'getMe', {}),
      tgRpc<{ ok?: boolean; ulangan?: number; update_24s?: number; miniapp_24s?: number }>(env, 't2_telegram_statistika_v1', { p_actor_id: s.id }),
    ]);
    return json({
      ok: true, sozlangan: true, sir_sozlangan: String(env.TELEGRAM_WEBHOOK_SECRET || '').trim().length >= 16,
      bot: me.result?.username ?? null, kutilgan_url: kutilganUrl,
      webhook: info.ok ? { ornatilgan: info.result?.url === kutilganUrl, url: info.result?.url || null, navbat: info.result?.pending_update_count ?? null,
        oxirgi_xato_vaqt: info.result?.last_error_date ? new Date(info.result.last_error_date * 1000).toISOString() : null,
        oxirgi_xato: info.result?.last_error_message?.slice(0, 200) ?? null } : null,
      statistika: stat?.ok ? { ulangan: stat.ulangan ?? null, update_24s: stat.update_24s ?? null, miniapp_24s: stat.miniapp_24s ?? null } : null,
    });
  }

  const a = await actor(request, env); if (a instanceof Response) return a;
  if (b.amal === 'kod') {
    if (!tokenBormi(env)) return json({ ok: false, code: 'SOZLANMAGAN', xabar: 'Telegram bot hali sozlanmagan.' }, 503);
    const kod = ulashKodYarat();
    const r = await tgRpc<{ ok?: boolean; code?: string; tugaydi?: string }>(env, 't2_telegram_kod_yarat_v1', { p_actor_id: a, p_kod_xesh: await ulashKodXesh(kod) });
    if (!r) return json({ ok: false, code: 'SERVER_XATO' }, 502);
    if (!r.ok) return json({ ok: false, code: r.code }, r.code === 'LIMIT' ? 429 : 400);
    return json({ ok: true, havola: deepLink(env, kod), tugaydi: r.tugaydi ?? null });
  }
  if (b.amal === 'uz') {
    const r = await tgRpc<{ ok?: boolean; code?: string; uzildi?: boolean; chat_id?: number; til?: 'uz' | 'ru' | 'en' | null }>(env, 't2_telegram_uz_v1',
      { p_actor_id: a, p_telegram_user_id: null, p_manba: 'web', p_operation_id: crypto.randomUUID() });
    if (!r?.ok) return json({ ok: false, code: r?.code || 'SERVER_XATO' }, 502);
    if (r.uzildi && Number.isSafeInteger(r.chat_id)) {
      await xabarYubor(env, r.chat_id as number, tgT('Telegram hisobingiz sayt orqali tizimdan uzildi.', r.til ?? 'uz')).catch(() => false);
    }
    return json({ ok: true, uzildi: !!r.uzildi });
  }
  if (b.amal === 'sozlama') {
    const s = b.bildirishnoma;
    if (!s || typeof s !== 'object' || Array.isArray(s)) return json({ ok: false, code: 'SOZLAMA_NOTOGRI' }, 400);
    const r = await tgRpc<{ ok?: boolean; code?: string; bildirishnoma?: Record<string, boolean> }>(env, 't2_telegram_sozlama_v1', { p_actor_id: a, p_bildirishnoma: s });
    if (!r) return json({ ok: false, code: 'SERVER_XATO' }, 502);
    return json(r, r.ok ? 200 : 400);
  }
  return json({ ok: false, code: 'AMAL_NOMALUM' }, 400);
};
