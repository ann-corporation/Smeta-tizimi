/**
 * POST /api/telegram/webhook — @qur_uz_bot webhook (egasi 2026-10-28, PR 1 poydevor).
 *
 *  • `X-Telegram-Bot-Api-Secret-Token` tekshiriladi (TELEGRAM_WEBHOOK_SECRET); sir sozlanmagan → 503 (fail closed).
 *  • Javob DARHOL 200 — ishlov `waitUntil` da. update_id bo'yicha idempotent (t2_telegram_update_qabul_v1), foydalanuvchi
 *    bo'yicha daqiqalik limit. Faqat shaxsiy chat. Xabar matni/username logga yozilmaydi.
 *  • Buyruqlar: /start <kod> (ulash), /start, /yordam (/help), /men, /ilova (/app), /chiqish. Ulanmagan foydalanuvchi
 *    faqat «ulang» ko'rsatmasini oladi. Ulangan foydalanuvchi FAQAT o'z t2_foydalanuvchi sifatida (t2_men_v1).
 */
import {
  type TgEnv, type TgTil, fonda, miniAppTugma, saytUrl, tgRpc, tgT, tilAniqla, ulashKodXesh, ulashKodYaroqli, webhookSirTekshir, xabarYubor,
} from '../../_shared/telegram';

type Xabar = { message_id?: number; text?: string; chat?: { id?: number; type?: string }; from?: { id?: number; is_bot?: boolean; language_code?: string } };
export type Update = { update_id?: number; message?: Xabar; edited_message?: Xabar; callback_query?: { id?: string; from?: { id?: number; language_code?: string } } };

const ROL_NOMI: Record<string, string> = {
  superadmin: 'Superadmin', admin: 'Administrator', boss: 'Rahbar (boss)', rahbar: 'Rahbar', bugalter: 'Buxgalter', pto: 'PTO',
  prorab: 'Prorab', buyurtmachi: 'Buyurtmachi', pudratchi: 'Pudratchi', kuzatuvchi: 'Kuzatuvchi',
};

export function buyruqAjrat(matn: string): { buyruq: string; arg: string } | null {
  const m = /^\/([a-z_]+)(?:@[A-Za-z0-9_]+)?(?:\s+(.*))?$/i.exec(matn.trim());
  return m ? { buyruq: m[1].toLowerCase(), arg: (m[2] || '').trim() } : null;
}

const yordamMatni = (til: TgTil) => [
  tgT('Buyruqlar:', til),
  '/men — ' + tgT('men kimman (hisob, kompaniya, rol)', til),
  '/ilova — ' + tgT('tizimni Telegram ichida ochish', til),
  '/chiqish — ' + tgT('Telegramni hisobdan uzish', til),
  '/yordam — ' + tgT('shu ro‘yxat', til),
].join('\n');

const ulangMatni = (env: TgEnv, til: TgTil) =>
  tgT('Siz hali tizimga ulanmagansiz. Saytga kiring: {sayt} → Akkaunt → Bildirishnomalar → «Telegramni ulash» tugmasini bosing.', til, { sayt: saytUrl(env) });

type Men = { ok?: boolean; foydalanuvchi?: { ism?: string | null; login?: string | null }; platform_role?: string;
  azoliklar?: { nom?: string; rol?: string }[] };

/** Bitta update ni qayta ishlaydi. Test qilinadi (javob — nima yuborilgani; matn loglanmaydi). */
export async function updateIshla(env: TgEnv, u: Update): Promise<string> {
  const msg = u.message;
  const tgId = msg?.from?.id ?? u.callback_query?.from?.id;
  if (!Number.isSafeInteger(u.update_id)) return 'update_id_yoq';
  const q = await tgRpc<{ ok?: boolean; yangi?: boolean; limit?: boolean }>(env, 't2_telegram_update_qabul_v1', { p_update_id: u.update_id, p_telegram_user_id: Number.isSafeInteger(tgId) ? tgId : null });
  if (!q?.ok) return 'baza_xato';
  if (!q.yangi) return 'takror';
  if (q.limit) return 'limit';
  if (!msg || !msg.chat || msg.chat.type !== 'private' || !Number.isSafeInteger(msg.chat.id) || !Number.isSafeInteger(tgId) || msg.from?.is_bot) return 'etibor_yoq';
  const chatId = msg.chat.id as number;
  const til = tilAniqla(msg.from?.language_code);
  const b = buyruqAjrat(String(msg.text || ''));

  if (b?.buyruq === 'start' && b.arg) {
    if (!ulashKodYaroqli(b.arg)) { await xabarYubor(env, chatId, tgT('Havola yaroqsiz. Saytdan yangi havola oling.', til)); return 'kod_format'; }
    const r = await tgRpc<{ ok?: boolean; code?: string; ism?: string | null }>(env, 't2_telegram_ulash_v1', {
      p_kod_xesh: await ulashKodXesh(b.arg), p_telegram_user_id: tgId, p_chat_id: chatId, p_til: til, p_operation_id: crypto.randomUUID(),
    });
    if (r?.ok) {
      await xabarYubor(env, chatId, tgT('Tayyor! Telegram hisobingiz tizimga ulandi{ism}. Endi shu yerdan tizimni ochishingiz va xabarlarni olishingiz mumkin.', til,
        { ism: r.ism ? ` (${r.ism})` : '' }) + '\n\n' + yordamMatni(til), { reply_markup: miniAppTugma(env, til) });
      return 'ulandi';
    }
    const XATO: Record<string, string> = {
      KOD_ISHLATILGAN: 'Bu havola allaqachon ishlatilgan. Saytdan yangi havola oling.',
      KOD_MUDDATI_OTGAN: 'Havolaning muddati tugagan (10 daqiqa). Saytdan yangi havola oling.',
      TELEGRAM_BOSHQA_HISOBDA: 'Bu Telegram boshqa hisobga ulangan. Avval /chiqish buyrug‘i bilan uzing.',
      FOYDALANUVCHI_FAOL_EMAS: 'Hisob faol emas. Administratorga murojaat qiling.',
    };
    await xabarYubor(env, chatId, tgT(XATO[r?.code || ''] ?? 'Havola topilmadi. Saytdan yangi havola oling.', til));
    return 'ulash_rad:' + (r?.code || 'xato');
  }

  const a = await tgRpc<{ ok?: boolean; ulangan?: boolean; foydalanuvchi_id?: number }>(env, 't2_telegram_aniqla_v1', { p_telegram_user_id: tgId });
  if (!a?.ok) { await xabarYubor(env, chatId, tgT('Server bilan aloqa yo‘q. Birozdan keyin urinib ko‘ring.', til)); return 'baza_xato'; }
  if (!a.ulangan || !a.foydalanuvchi_id) { await xabarYubor(env, chatId, ulangMatni(env, til)); return 'ulanmagan'; }
  const uid = a.foydalanuvchi_id;

  switch (b?.buyruq) {
    case 'start':
      await xabarYubor(env, chatId, tgT('Assalomu alaykum! Smeta tizimi boti.', til) + '\n\n' + yordamMatni(til), { reply_markup: miniAppTugma(env, til) });
      return 'salom';
    case 'yordam': case 'help':
      await xabarYubor(env, chatId, yordamMatni(til), { reply_markup: miniAppTugma(env, til) });
      return 'yordam';
    case 'ilova': case 'app':
      await xabarYubor(env, chatId, tgT('Tizimni ochish uchun tugmani bosing.', til), { reply_markup: miniAppTugma(env, til) });
      return 'ilova';
    case 'men': {
      const m = await tgRpc<Men>(env, 't2_men_v1', { p_actor_id: uid });
      if (!m?.ok) { await xabarYubor(env, chatId, tgT('Hisob ma’lumotini o‘qib bo‘lmadi.', til)); return 'men_xato'; }
      const ism = m.foydalanuvchi?.ism || m.foydalanuvchi?.login || '—';
      const qatorlar = (m.azoliklar ?? []).slice(0, 20).map((z) => `• ${z.nom ?? '—'} — ${tgT(ROL_NOMI[z.rol ?? ''] ?? (z.rol || '—'), til)}`);
      await xabarYubor(env, chatId, [
        tgT('Siz: {ism}', til, { ism }),
        ...(m.platform_role === 'superadmin' ? [tgT('Platforma roli: superadmin', til)] : []),
        qatorlar.length ? tgT('Ish joylari va rollar:', til) : tgT('Hali hech qaysi ish joyiga a’zo emassiz.', til),
        ...qatorlar,
      ].join('\n'), { reply_markup: miniAppTugma(env, til) });
      return 'men';
    }
    case 'chiqish': case 'logout': {
      const r = await tgRpc<{ ok?: boolean; uzildi?: boolean }>(env, 't2_telegram_uz_v1', { p_actor_id: null, p_telegram_user_id: tgId, p_manba: 'bot', p_operation_id: crypto.randomUUID() });
      await xabarYubor(env, chatId, r?.ok ? tgT('Telegram hisobingiz tizimdan uzildi. Qayta ulash uchun saytdagi «Telegramni ulash» tugmasidan foydalaning.', til)
        : tgT('Server bilan aloqa yo‘q. Birozdan keyin urinib ko‘ring.', til), { reply_markup: { remove_keyboard: true } });
      return r?.ok ? 'uzildi' : 'uz_xato';
    }
    default:
      await xabarYubor(env, chatId, tgT('Hozircha bot shu buyruqlarni tushunadi.', til) + '\n\n' + yordamMatni(til), { reply_markup: miniAppTugma(env, til) });
      return 'nomalum';
  }
}

export const onRequestPost: PagesFunction<TgEnv> = async (ctx) => {
  const sir = webhookSirTekshir(ctx.request, ctx.env.TELEGRAM_WEBHOOK_SECRET);
  if (sir === 'sozlanmagan') return new Response('not configured', { status: 503 });
  if (sir === 'rad') return new Response('forbidden', { status: 403 });
  let u: Update | null = null;
  try { u = await ctx.request.json() as Update; } catch { u = null; }
  // Noto'g'ri tana — Telegram qayta yubormasin (200), ishlov yo'q.
  if (u && typeof u === 'object') fonda(ctx, updateIshla(ctx.env, u));
  return new Response('ok', { status: 200, headers: { 'Cache-Control': 'no-store' } });
};
