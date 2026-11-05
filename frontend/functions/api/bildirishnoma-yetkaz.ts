/**
 * POST /api/bildirishnoma-yetkaz — hujjat.* bildirishnomalarini Telegram'ga yetkazish (fon ishi; GitHub Actions har 15 daqiqada).
 *
 *  • Kirish FAQAT `X-Cron-Kalit` sarlavhasi bilan: Cloudflare Pages sirri `BILDIRISHNOMA_CRON_KALIT` (kamida 24 belgi) ga teng bo'lishi shart.
 *    Sir sozlanmagan → 503, noto'g'ri → 403 (fail closed). Sessiya/foydalanuvchi yo'q — hech qanday kompaniya ma'lumoti qaytmaydi.
 *  • `TELEGRAM_BOT_TOKEN` yo'q → navbat OLINMAYDI (qatorlar keyinga qoladi), javob `telegram: false`.
 *  • Navbat/holat bazada: t2_bildirishnoma_tg_navbat_v1 → yetkazPartiya → t2_bildirishnoma_tg_natija_v1 (migratsiya 20261203000500).
 *    Ilova ichidagi qo'ng'iroqcha bunga bog'liq emas: t2_outbox → t2_bildirishnoma ni pg_cron (t2-outbox-bildirishnoma) bajaradi.
 *  • Matn, chat_id, token loglanmaydi; javobda faqat sonlar.
 */
import { saytUrl, tengSatr, tgApi, tgRpc, tokenBormi, type TgEnv } from '../_shared/telegram';
import { tgTarjima, xulosa, yetkazPartiya, type Bogliqlik, type Manzil, type NavbatQator, type TgTil } from '../_shared/bildirishnoma-yetkaz';

type Env = TgEnv & { BILDIRISHNOMA_CRON_KALIT?: string };

const JAVOB = { headers: { 'Cache-Control': 'no-store' } };
const javob = (d: unknown, status = 200) => Response.json(d, { status, ...JAVOB });
export const KALIT_MIN = 24;
const PARTIYA = 50;
const MAX_URINISH = 3;

/** Kalit tekshiruvi: sozlanmagan → 'sozlanmagan', mos emas → 'rad'. */
export function cronKalitTekshir(req: Request, sir: string | undefined): 'ok' | 'sozlanmagan' | 'rad' {
  const kutilgan = String(sir || '').trim();
  if (kutilgan.length < KALIT_MIN) return 'sozlanmagan';
  const kelgan = req.headers.get('X-Cron-Kalit') || '';
  return tengSatr(kelgan, kutilgan) ? 'ok' : 'rad';
}

export function bogliqlik(env: Env): Bogliqlik {
  return {
    manzil: async (foydalanuvchiId): Promise<Manzil> => {
      if (!Number.isSafeInteger(foydalanuvchiId) || foydalanuvchiId <= 0) return { yuborish: false };
      const m = await tgRpc<{ ok?: boolean; yuborish?: boolean; chat_id?: number; til?: TgTil | null }>(env, 't2_telegram_manzil_v1',
        { p_foydalanuvchi_id: foydalanuvchiId, p_tur: 'topshiriq' });
      if (!m?.ok) return null;
      return { yuborish: !!m.yuborish, chat_id: m.chat_id, til: m.til ?? null };
    },
    yubor: async (chatId, matn, til, havola) => {
      const tugma = havola
        ? { reply_markup: { inline_keyboard: [[{ text: tgTarjima('Hujjatni ochish', til), url: saytUrl(env) + havola }]] } }
        : {};
      const r = await tgApi(env, 'sendMessage', { chat_id: chatId, text: matn.slice(0, 4000), disable_web_page_preview: true, ...tugma });
      // TOKEN_YOQ — so'rov umuman ketmagan; TARMOQ — ketgan-ketmagani noma'lum (qayta yuborilmaydi).
      return { ok: r.ok, description: r.description, yetdi: r.description === 'TOKEN_YOQ' ? false : undefined };
    },
  };
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const env = ctx.env;
  const k = cronKalitTekshir(ctx.request, env.BILDIRISHNOMA_CRON_KALIT);
  if (k === 'sozlanmagan') return javob({ ok: false, code: 'SOZLANMAGAN' }, 503);
  if (k === 'rad') return javob({ ok: false, code: 'RAD' }, 403);
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return javob({ ok: false, code: 'SERVER_SOZLANMAGAN' }, 503);
  if (!tokenBormi(env)) return javob({ ok: true, telegram: false, olindi: 0 });

  const n = await tgRpc<{ ok?: boolean; qatorlar?: NavbatQator[]; navbatga?: number; otkazildi?: number; nomalum?: number }>(env,
    't2_bildirishnoma_tg_navbat_v1', { p_limit: PARTIYA, p_max_urinish: MAX_URINISH });
  if (!n?.ok || !Array.isArray(n.qatorlar)) return javob({ ok: false, code: 'NAVBAT_XATO' }, 502);

  const natijalar = await yetkazPartiya(n.qatorlar, bogliqlik(env));
  let yozildi = 0;
  if (natijalar.length) {
    const w = await tgRpc<{ ok?: boolean; yangilandi?: number }>(env, 't2_bildirishnoma_tg_natija_v1', { p_natijalar: natijalar, p_max_urinish: MAX_URINISH });
    // Natija yozilmasa qatorlar «yuborilmoqda» qoladi va 30 daqiqadan keyin «nomalum» bo'ladi — qayta yuborilmaydi.
    if (!w?.ok) return javob({ ok: false, code: 'NATIJA_YOZILMADI', olindi: natijalar.length, ...xulosa(natijalar) }, 502);
    yozildi = w.yangilandi ?? 0;
  }
  return javob({ ok: true, telegram: true, olindi: natijalar.length, yozildi, navbatga: n.navbatga ?? 0, ...xulosa(natijalar) });
};
