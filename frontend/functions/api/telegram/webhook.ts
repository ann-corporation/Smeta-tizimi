/**
 * POST /api/telegram/webhook — @qur_uz_bot webhook (egasi 2026-10-28, PR 1 poydevor).
 *
 *  • `X-Telegram-Bot-Api-Secret-Token` tekshiriladi (TELEGRAM_WEBHOOK_SECRET); sir sozlanmagan → 503 (fail closed).
 *  • Javob DARHOL 200 — ishlov `waitUntil` da. update_id bo'yicha idempotent (t2_telegram_update_qabul_v1), foydalanuvchi
 *    bo'yicha daqiqalik limit. Faqat shaxsiy chat. Xabar matni/username logga yozilmaydi.
 *  • Buyruqlar: /start <kod> (ulash), /start, /yordam (/help), /men, /ilova (/app), /chiqish, /bugun, /obyektlar, /jarvis, /kunlik, /fakt; rasm → foto-dalil (+ qatorga biriktirish);
 *    callback_query (menyu, hujjat tasdiqi) — _shared/telegram-bot.ts (V2: docs/architecture/TELEGRAM_BOT_V2.md). Ulanmagan foydalanuvchi
 *    faqat «ulang» ko'rsatmasini oladi. Ulangan foydalanuvchi FAQAT o'z t2_foydalanuvchi sifatida (t2_men_v1).
 */
import {
  type TgEnv, type TgTil, fonda, miniAppTugma, saytUrl, tgApi, tgRpc, tgT, tilAniqla, ulashKodXesh, ulashKodYaroqli, webhookSirTekshir, xabarYubor,
} from '../../_shared/telegram';
import { type BotJavob, type Callback, type TgRasm, bugunJavobi, fotoAmali, jarvisJavobi, kunlikAmali, obyektlarJavobi, yordamMatni } from '../../_shared/telegram-bot';
import { callbackIshlaV2, faktTaklif, fotoQidiruv, menyuTugmasi, qidiruvKonteksti } from '../../_shared/telegram-bot-oqim';
import { startTugmalari } from '../../_shared/telegram-tugma';
import { omborBuyruq, omborCallback, omborSavolCallback } from '../../_shared/telegram-ombor';
import { NONCE_PREFIKS, kalitYaroqli, nonceYaroqli, xesh, yoqilgan } from '../../_shared/kirish-emailsiz';
import { type KanalEnv, kanalCallback, kanalCallbackmi, kanalTahrirJavobi, tahrirBelgisi } from '../../_shared/telegram-kanal';
import { menUsernameQatori, taklifJavobi, usernameCallback, usernameJavobi, usernameTaklifi } from '../../_shared/telegram-username';
import { telegramJarvisMenu, telegramJarvisReply, telegramJarvisSelect, type JarvisBotReply, type JarvisReplyTo } from '../../_shared/telegram-jarvis';

type Xabar = { message_id?: number; reply_to_message?: JarvisReplyTo & { text?: string }; text?: string; caption?: string; photo?: TgRasm[]; voice?: { file_id?: string; file_size?: number }; audio?: { file_id?: string; file_size?: number }; contact?: { phone_number?: string; user_id?: number }; chat?: { id?: number; type?: string }; from?: { id?: number; is_bot?: boolean; language_code?: string; username?: string } };
export type Update = { update_id?: number; message?: Xabar; edited_message?: Xabar; callback_query?: Callback };

const ROL_NOMI: Record<string, string> = {
  superadmin: 'Superadmin', admin: 'Administrator', boss: 'Rahbar (boss)', rahbar: 'Rahbar', bugalter: 'Buxgalter', pto: 'PTO',
  prorab: 'Prorab', buyurtmachi: 'Buyurtmachi', pudratchi: 'Pudratchi', kuzatuvchi: 'Kuzatuvchi',
};

export function buyruqAjrat(matn: string): { buyruq: string; arg: string } | null {
  const m = /^\/([a-z_]+)(?:@[A-Za-z0-9_]+)?(?:\s+(.*))?$/i.exec(matn.trim());
  return m ? { buyruq: m[1].toLowerCase(), arg: (m[2] || '').trim() } : null;
}

const ulangMatni = (env: TgEnv, til: TgTil) =>
  tgT('Siz hali tizimga ulanmagansiz. Saytga kiring: {sayt} → Akkaunt → Bildirishnomalar → «Telegramni ulash» tugmasini bosing.', til, { sayt: saytUrl(env) });

type Men = { ok?: boolean; foydalanuvchi?: { ism?: string | null; login?: string | null }; platform_role?: string;
  azoliklar?: { nom?: string; rol?: string }[] };

const yubor = (env: TgEnv, chatId: number, j: BotJavob) => xabarYubor(env, chatId, j.matn, j.markup ? { reply_markup: j.markup } : {});
async function jarvisYubor(env: TgEnv, chatId: number, reply: JarvisBotReply) {
  for (const page of reply.transcript ?? []) if (!await xabarYubor(env, chatId, page, reply.transcriptOptions)) break;
  await xabarYubor(env, chatId, reply.matn, reply.options);
}

/** Inline tugma bosildi. Faqat shaxsiy chat (chat.id == from.id) va BOG'LANGAN foydalanuvchi; amal ruxsati — mavjud qatlamda (telegram-bot.ts). */
async function callbackAjrat(env: TgEnv, cb: Callback, tgId: number | undefined): Promise<string> {
  const chat = cb.message?.chat;
  const javobBer = (text?: string) => tgApi(env, 'answerCallbackQuery', { callback_query_id: cb.id, ...(text ? { text: text.slice(0, 180) } : {}) });
  if (!cb.id || !Number.isSafeInteger(tgId) || !chat || chat.type !== 'private' || chat.id !== tgId || !Number.isSafeInteger(chat.id)) {
    if (cb.id) await javobBer();
    return 'etibor_yoq';
  }
  const til = tilAniqla(cb.from?.language_code);
  const a = await tgRpc<{ ok?: boolean; ulangan?: boolean; foydalanuvchi_id?: number }>(env, 't2_telegram_aniqla_v1', { p_telegram_user_id: tgId });
  if (!a?.ok || !a.ulangan || !a.foydalanuvchi_id) { await javobBer(tgT('Avval hisobni ulang', til)); return 'cb_ulanmagan'; }
  if (typeof cb.data === 'string' && cb.data.startsWith('j:')) {
    await javobBer();
    await jarvisYubor(env, chat.id as number, await telegramJarvisSelect(env, a.foydalanuvchi_id, tgId as number, til, cb.data));
    return 'cb:jarvis';
  }
  if (typeof cb.data === 'string' && cb.data.startsWith('usr:')) {
    /* USERNAME-V1: Telegram username ni QURAI username qilish — foydalanuvchi tugma bilan tasdiqlaydi; qiymat RPC da qayta tekshiriladi. */
    const u = await usernameCallback(env, a.foydalanuvchi_id, til, cb.data);
    await javobBer(u.toast || undefined);
    if (u.xabar) await xabarYubor(env, chat.id as number, u.xabar.matn);
    if (Number.isSafeInteger(cb.message?.message_id)) await tgApi(env, 'editMessageReplyMarkup', { chat_id: chat.id, message_id: cb.message?.message_id, reply_markup: { inline_keyboard: [] } });
    return 'cb:' + u.amal;
  }
  if (kanalCallbackmi(cb.data)) {
    /* KANAL-BOSHQARUV: kanalga chiqarish/o'chirish FAQAT egasi (superadmin) shu tugmani bosganda; qoralama egasi va rol qayta tekshiriladi. */
    const k = await kanalCallback(env as KanalEnv, a.foydalanuvchi_id, til, String(cb.data), chat.id as number);
    await javobBer(k.toast || undefined);
    if (k.tugmalarniOlibTashla && Number.isSafeInteger(cb.message?.message_id)) await tgApi(env, 'editMessageReplyMarkup', { chat_id: chat.id, message_id: cb.message?.message_id, reply_markup: { inline_keyboard: [] } });
    return k.amal;
  }
  const r = typeof cb.data === 'string' && cb.data.startsWith('os:')
    ? await omborSavolCallback(env, a.foydalanuvchi_id, til, cb)   // OMBOR: aniqlovchi savol / QQS tugmalari (imzolangan token xabar matnida)
    : typeof cb.data === 'string' && cb.data.startsWith('ob:')
    ? await omborCallback(env, a.foydalanuvchi_id, til, cb)   // OMBOR-OVOZ: tasdiq tokeni preview xabari matnida
    : await callbackIshlaV2(env, a.foydalanuvchi_id, til, cb, chat.id as number);
  await javobBer(r.toast || undefined);
  if (r.xabar) await yubor(env, chat.id as number, r.xabar);
  if (r.tugmalarniOlibTashla && Number.isSafeInteger(cb.message?.message_id)) {
    await tgApi(env, 'editMessageReplyMarkup', { chat_id: chat.id, message_id: cb.message?.message_id, reply_markup: { inline_keyboard: [] } });
  }
  return 'cb:' + r.amal;
}

/** Bitta update ni qayta ishlaydi. Test qilinadi (javob — nima yuborilgani; matn loglanmaydi). */
export async function updateIshla(env: TgEnv, u: Update): Promise<string> {
  const msg = u.message;
  const tgId = msg?.from?.id ?? u.callback_query?.from?.id;
  if (!Number.isSafeInteger(u.update_id)) return 'update_id_yoq';
  const q = await tgRpc<{ ok?: boolean; yangi?: boolean; limit?: boolean }>(env, 't2_telegram_update_qabul_v1', { p_update_id: u.update_id, p_telegram_user_id: Number.isSafeInteger(tgId) ? tgId : null });
  if (!q?.ok) return 'baza_xato';
  if (!q.yangi) return 'takror';
  if (q.limit) return 'limit';
  if (u.callback_query) return callbackAjrat(env, u.callback_query, tgId);
  if (!msg || !msg.chat || msg.chat.type !== 'private' || !Number.isSafeInteger(msg.chat.id) || !Number.isSafeInteger(tgId) || msg.from?.is_bot) return 'etibor_yoq';
  const chatId = msg.chat.id as number;
  const til = tilAniqla(msg.from?.language_code);
  const b = buyruqAjrat(String(msg.text || ''));

  /* Emailsiz kirish (20261217200000): telefonni Telegram kontakti bilan tasdiqlash. Faqat shu oqim — hisob/sessiya bu yerda
     BERILMAYDI (brauzer nonce + o'z siri bilan /api/kirish-telegram dan oladi). contact.user_id == from.id SQL da ham tekshiriladi. */
  if (msg.contact) {
    const k = msg.contact;
    const r = await tgRpc<{ ok?: boolean; code?: string }>(env, 't2_tg_kirish_kontakt_v1', {
      p_telegram_user_id: tgId, p_contact_user_id: Number.isSafeInteger(k.user_id) ? k.user_id : null,
      p_telefon: String(k.phone_number || '').slice(0, 30), p_chat_id: chatId,
    });
    const KONTAKT_XATO: Record<string, string> = {
      KONTAKT_BOSHQANIKI: 'Faqat o‘zingizning raqamingizni yuboring (pastdagi tugma orqali). Boshqa odamning kontakti qabul qilinmaydi.',
      TELEFON_NOTOGRI: 'Hozircha faqat O‘zbekiston (+998) raqamlari qabul qilinadi. Saytdan qaytadan boshlang.',
    };
    await xabarYubor(env, chatId, tgT(r?.ok ? 'Raqam tasdiqlandi. Saytga qayting — kirish avtomatik tugaydi.' : (KONTAKT_XATO[r?.code || ''] ?? 'So‘rov topilmadi yoki muddati tugagan (5 daqiqa). Saytdan qaytadan boshlang.'), til),
      { reply_markup: { remove_keyboard: true } });
    return r?.ok ? 'kontakt_ok' : 'kontakt_rad:' + (r?.code || 'xato');
  }
  if (b?.buyruq === 'start' && b.arg.startsWith(NONCE_PREFIKS)) {
    const kalit = String(env.SESSIYA_KALIT || '');
    if (!yoqilgan((env as { KIRISH_TELEGRAM_YOQILGAN?: string }).KIRISH_TELEGRAM_YOQILGAN) || !kalitYaroqli(kalit)) { await xabarYubor(env, chatId, tgT('Telegram orqali kirish hozircha yoqilmagan.', til)); return 'kirish_yoqilmagan'; }
    const r = nonceYaroqli(b.arg) ? await tgRpc<{ ok?: boolean; code?: string; belgi?: string }>(env, 't2_tg_kirish_start_v1', {
      p_nonce_xesh: await xesh('tg-nonce', b.arg, kalit), p_telegram_user_id: tgId, p_chat_id: chatId, p_til: til,
    }) : null;
    if (!r?.ok) { await xabarYubor(env, chatId, tgT('So‘rov topilmadi yoki muddati tugagan (5 daqiqa). Saytdan qaytadan boshlang.', til)); return 'kirish_rad'; }
    await xabarYubor(env, chatId, tgT('Saytdagi kirish so‘rovi. Moslik raqami: {belgi}. Saytda ham aynan shu raqam ko‘rinib tursa, pastdagi tugma orqali O‘ZINGIZNING telefon raqamingizni yuboring. Ko‘rinmasa yoki bu so‘rovni siz boshlamagan bo‘lsangiz — hech narsa yubormang.', til, { belgi: String(r.belgi || '') }),
      { reply_markup: { keyboard: [[{ text: tgT('Raqamimni yuborish', til), request_contact: true }]], resize_keyboard: true, one_time_keyboard: true } });
    return 'kirish_start';
  }

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

  // KANAL-BOSHQARUV: «Tahrirlash» xabariga javob — qoralama matni yangilanadi (chiqarilmaydi).
  const kpId = tahrirBelgisi(msg.reply_to_message);
  if (kpId && typeof msg.text === 'string') return kanalTahrirJavobi(env as KanalEnv, uid, til, chatId, kpId, msg.text);
  // OMBOR-OVOZ: ovozli xabar / oddiy matn → omborchi buyrug'i (preview + tasdiq tugmalari). Omborchi bo'lmasa — oddiy oqim davom etadi.
  const ovoz = msg.voice?.file_id ?? msg.audio?.file_id;
  if (ovoz || (!b && typeof msg.text === 'string' && msg.text.trim() && !qidiruvKonteksti(msg.reply_to_message))) {
    const j = await omborBuyruq(env, uid, til, ovoz ? { fileId: ovoz } : { matn: String(msg.text) });
    if (j) { await yubor(env, chatId, j); return ovoz ? 'ombor_ovoz' : 'ombor_matn'; }
    if (ovoz) { await xabarYubor(env, chatId, tgT('Ovozli buyruq faqat omborchilar uchun.', til)); return 'ovoz_ruxsatsiz'; }
  }

  // Rasm (izoh bilan yoki izohsiz) → foto-dalil (umumiy, faktga biriktirilmagan). Fakt summasi/hajmi yozilmaydi.
  if (Array.isArray(msg.photo) && msg.photo.length) {
    const j = await fotoAmali(env, uid, til, msg.photo.slice(0, 10), String(msg.caption || '').slice(0, 600));
    await yubor(env, chatId, j);
    if (j.obyektId) await menyuTugmasi(env, uid, til, chatId, j.obyektId);   // Mini App tugmasi oxirgi obyektda ochiladi
    return 'foto';
  }

  // Javob (reply): «Fakt qatoriga biriktirish» oqimida bot so'ragan qidiruv so'zi. Kontekst bot xabaridagi belgidan; id lar serverda qayta tekshiriladi.
  if (!b && typeof msg.text === 'string') {
    const k = qidiruvKonteksti(msg.reply_to_message);
    if (k) { await yubor(env, chatId, await fotoQidiruv(env, uid, til, k, msg.text.slice(0, 200))); return 'foto_qidiruv'; }
    if (chatId === tgId) {
      const reply = await telegramJarvisReply(env, uid, chatId, til, msg.reply_to_message, msg.text);
      if (reply) { await jarvisYubor(env, chatId, reply); return 'jarvis_reply'; }
    }
  }

  switch (b?.buyruq) {
    case 'start': {
      const m = await tgRpc<Men>(env, 't2_men_v1', { p_actor_id: uid });
      const ism = m?.ok ? (m.foydalanuvchi?.ism || m.foydalanuvchi?.login || '') : '';
      await xabarYubor(env, chatId, [tgT('Assalomu alaykum! QURAI boti.', til),
        ism ? tgT('Hisob ulangan: {ism}', til, { ism }) : tgT('Hisob ulangan.', til), '', yordamMatni(til)].join('\n'), { reply_markup: startTugmalari(env, til) });
      await menyuTugmasi(env, uid, til, chatId);
      /* USERNAME-V1: QURAI username bo'sh va Telegram username mos bo'lsa — tasdiq so'raladi (jimgina yozilmaydi). */
      const taklif = await usernameTaklifi(env, uid, til, msg.from?.username);
      if (taklif) await xabarYubor(env, chatId, taklif.matn, { reply_markup: taklif.markup });
      return 'salom';
    }
    case 'bugun': await yubor(env, chatId, await bugunJavobi(env, uid, til)); return 'bugun';
    case 'obyektlar': await yubor(env, chatId, await obyektlarJavobi(env, uid, til)); return 'obyektlar';
    case 'jarvis':
      if (b.arg) await yubor(env, chatId, await jarvisJavobi(env, uid, til, b.arg));
      else if (chatId === tgId) await jarvisYubor(env, chatId, await telegramJarvisMenu(env, uid, til));
      return 'jarvis';
    case 'kunlik': await yubor(env, chatId, await kunlikAmali(env, uid, til, b?.arg ?? '')); return 'kunlik';
    case 'fakt': await yubor(env, chatId, await faktTaklif(env, uid, til, b?.arg ?? '')); return 'fakt';
    case 'hisobot': case 'qoldiq': case 'ostatka': {
      // OMBOR: /hisobot o'tgan oy sement · /qoldiq 2026-11-01 — matn omborchi buyrug'i bilan bir xil yo'ldan (tahlil → kartochka) o'tadi.
      const j = await omborBuyruq(env, uid, til, { matn: (b?.buyruq === 'hisobot' ? 'hisobot ' : 'qoldiq ') + (b?.arg ?? '') });
      await yubor(env, chatId, j ?? { matn: tgT('Bu buyruq faqat omborchilar uchun.', til) });
      return 'ombor_' + b?.buyruq;
    }
    case 'yordam': case 'help':
      await xabarYubor(env, chatId, yordamMatni(til), { reply_markup: miniAppTugma(env, til) });
      return 'yordam';
    case 'ilova': case 'app':
      await xabarYubor(env, chatId, tgT('Tizimni ochish uchun tugmani bosing.', til), { reply_markup: miniAppTugma(env, til) });
      await menyuTugmasi(env, uid, til, chatId);
      return 'ilova';
    case 'men': {
      const m = await tgRpc<Men>(env, 't2_men_v1', { p_actor_id: uid });
      if (!m?.ok) { await xabarYubor(env, chatId, tgT('Hisob ma’lumotini o‘qib bo‘lmadi.', til)); return 'men_xato'; }
      const ism = m.foydalanuvchi?.ism || m.foydalanuvchi?.login || '—';
      const qatorlar = (m.azoliklar ?? []).slice(0, 20).map((z) => `• ${z.nom ?? '—'} — ${tgT(ROL_NOMI[z.rol ?? ''] ?? (z.rol || '—'), til)}`);
      await xabarYubor(env, chatId, [
        tgT('Siz: {ism}', til, { ism }),
        ...(m.platform_role === 'superadmin' ? [tgT('Platforma roli: superadmin', til)] : []),
        ...(await menUsernameQatori(env, uid, til)),
        qatorlar.length ? tgT('Ish joylari va rollar:', til) : tgT('Hali hech qaysi ish joyiga a’zo emassiz.', til),
        ...qatorlar,
      ].join('\n'), { reply_markup: miniAppTugma(env, til) });
      return 'men';
    }
    case 'username': await xabarYubor(env, chatId, await usernameJavobi(env, uid, til, b?.arg ?? '')); return 'username';
    case 'taklif': await xabarYubor(env, chatId, await taklifJavobi(env, uid, til, b?.arg ?? '')); return 'taklif';
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
