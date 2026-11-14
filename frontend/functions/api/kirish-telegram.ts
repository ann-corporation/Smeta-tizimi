/**
 * kirish-telegram.ts — «TELEGRAM ORQALI KIRISH»: telefonni Telegram kontakti bilan tasdiqlash (bepul, SMS yo'q).
 *
 * POST { amal:'boshla', ism? } → { ok, nonce, sir, belgi, havola, tugaydi }
 *      Server bir martalik nonce (5 daqiqa) va brauzer siri yaratadi; bazaga FAQAT ikkalasining HMAC xeshi yoziladi.
 *      `havola` = t.me/<bot>?start=<nonce>. `sir` faqat shu javobda — brauzer uni sessionStorage'da saqlaydi (havolada YO'Q),
 *      shuning uchun havolani o'g'irlagan odam sessiya ola olmaydi. `belgi` — botda ham ko'rsatiladigan 4 xonali moslik raqami.
 * POST { amal:'holat', nonce, sir } → kutmoqda | tayyor (sess cookie: mavjud hisob → kirish; yo'q → hisob (a'zoliksiz, bepul tarif
 *      qoidalari email ro'yxati bilan bir xil) ochiladi, ism FORMADAN) | umumiy rad.
 * Botdagi qism: functions/api/telegram/webhook.ts (webhook sir tekshiruvi mavjud, contact.user_id == from.id).
 *
 * Sozlama: KIRISH_TELEGRAM_YOQILGAN (sukut — o'chiq) + TELEGRAM_BOT_TOKEN/WEBHOOK_SECRET (mavjud bot). Origin tekshiruvi.
 * Hisobni egallab olish YO'Q: qoidalar SQL da (t2_tg_kirish_holat_v1) — telefon bo'yicha faqat Telegram o'zi tasdiqlagan hisobga kiriladi.
 */
import { imzola, type Rol } from '../_shared/auth';
import { deepLink, tokenBormi } from '../_shared/telegram';
import {
  type KirishEnv, NONCE_PREFIKS, UUID, ipBelgi, json, kalitYaroqli, nonceYaroqli, originYaroqsiz, sbRpc, sessCookie, tasodifiyToken, TOKEN_FORMAT, xesh, yoqilgan,
} from '../_shared/kirish-emailsiz';

type Env = KirishEnv;
type RpcNatija = { ok?: boolean; code?: string; holat?: string; yangi?: boolean; tugaydi?: string; foydalanuvchi_id?: number; login?: string; rol?: string; azoliklar?: { kompaniya_id: number; rol: string }[] };

const RAD: Record<string, [number, string]> = {
  TOPILMADI: [404, 'So‘rov topilmadi yoki eskirgan. Qaytadan boshlang.'],
  MUDDATI_OTGAN: [410, 'Muddat tugadi. Qaytadan boshlang.'],
  KIRISH_RAD: [403, 'Bu raqam bilan Telegram orqali kirib bo‘lmadi. Boshqa usulni tanlang.'],
  LIMIT: [429, 'Juda ko‘p urinish. Birozdan keyin qayta urinib ko‘ring.'],
};

export const onRequestGet: PagesFunction<Env> = async (ctx) => json({
  ok: true, yoqilgan: yoqilgan(ctx.env.KIRISH_TELEGRAM_YOQILGAN) && tokenBormi(ctx.env),
});

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const { env, request } = ctx;
  if (originYaroqsiz(request)) return json({ ok: false, code: 'ORIGIN_INVALID' }, 403);
  if (!yoqilgan(env.KIRISH_TELEGRAM_YOQILGAN)) return json({ ok: false, code: 'YOQILMAGAN', xabar: 'Telegram orqali kirish hali yoqilmagan.' }, 503);
  if (!tokenBormi(env) || !env.SUPABASE_URL || !env.SUPABASE_KEY || !kalitYaroqli(env.SESSIYA_KALIT)) return json({ ok: false, code: 'SOZLANMAGAN', xabar: 'Telegram bot hali sozlanmagan.' }, 503);
  let b: Record<string, unknown> = {};
  try { b = await request.json() as Record<string, unknown>; } catch { return json({ ok: false, code: 'BODY_INVALID' }, 400); }
  if (!b || typeof b !== 'object') return json({ ok: false, code: 'BODY_INVALID' }, 400);
  const kalit = String(env.SESSIYA_KALIT);

  if (b.amal === 'boshla') {
    const nonce = NONCE_PREFIKS + tasodifiyToken(24);
    const sir = tasodifiyToken(32);
    const q = new Uint32Array(1); crypto.getRandomValues(q);
    const belgi = String(q[0] % 10000).padStart(4, '0');
    const ism = String(b.ism ?? '').trim().slice(0, 120);
    const r = await sbRpc<RpcNatija>(env, 't2_tg_kirish_boshla_v1', {
      p_nonce_xesh: await xesh('tg-nonce', nonce, kalit), p_brauzer_xesh: await xesh('tg-brauzer', sir, kalit), p_belgi: belgi, p_ism: ism || null, p_ip_belgi: await ipBelgi(request),
    });
    if (!r.data) return json({ ok: false, code: 'SERVER_XATO', xabar: 'Server bilan aloqa yo‘q.' }, 502);
    if (!r.data.ok) return json({ ok: false, code: r.data.code || 'XATO', xabar: RAD[r.data.code || '']?.[1] || 'Boshlab bo‘lmadi.' }, r.data.code === 'LIMIT' ? 429 : 400);
    return json({ ok: true, nonce, sir, belgi, havola: deepLink(env, nonce), tugaydi: r.data.tugaydi });
  }

  if (b.amal === 'holat') {
    const nonce = typeof b.nonce === 'string' ? b.nonce : '';
    const sir = typeof b.sir === 'string' ? b.sir : '';
    if (!nonceYaroqli(nonce) || !TOKEN_FORMAT.test(sir)) return json({ ok: false, code: 'TOPILMADI', xabar: RAD.TOPILMADI[1] }, 404);
    const opId = UUID.test(String(b.operation_id || '')) ? String(b.operation_id) : crypto.randomUUID();
    const r = await sbRpc<RpcNatija>(env, 't2_tg_kirish_holat_v1', {
      p_nonce_xesh: await xesh('tg-nonce', nonce, kalit), p_brauzer_xesh: await xesh('tg-brauzer', sir, kalit), p_ip_belgi: await ipBelgi(request), p_operation_id: opId,
    });
    if (!r.data) return json({ ok: false, code: 'SERVER_XATO', xabar: 'Server bilan aloqa yo‘q.' }, 502);
    if (r.data.ok && r.data.holat === 'kutmoqda') return json({ ok: true, holat: 'kutmoqda' });
    if (!r.data.ok || r.data.holat !== 'tayyor' || !r.data.foydalanuvchi_id || !r.data.login || !r.data.rol) {
      const [st, xabar] = RAD[r.data.code || ''] || RAD.TOPILMADI;
      return json({ ok: false, code: r.data.code && RAD[r.data.code] ? r.data.code : 'TOPILMADI', xabar }, st);
    }
    let sess: string;
    try { sess = await imzola({ rol: r.data.rol as Rol, email: r.data.login, foydalanuvchi_id: r.data.foydalanuvchi_id, kompaniyalar: r.data.azoliklar || [] }, kalit); }
    catch { return json({ ok: false, code: 'CONFIG', xabar: 'Server sozlanmagan (SESSIYA_KALIT).' }, 503); }
    return json({ ok: true, holat: 'tayyor', yangi: !!r.data.yangi, rol: r.data.rol }, 200, { 'Set-Cookie': sessCookie(sess) });
  }

  return json({ ok: false, code: 'AMAL_NOMALUM' }, 400);
};
