/**
 * telegram-bot.ts — @qur_uz_bot buyruqlari va inline tugmalari (Telegram V2, 1-bosqich).
 *
 *  /bugun · /obyektlar · /jarvis · /kunlik · rasm → foto-dalil · callback (menyu, tasdiq).
 *
 * QOIDALAR:
 *  • Har amal FAQAT bog'langan foydalanuvchi (t2_telegram_aniqla_v1) uchun; `uid` hech qachon matn/callback_data dan olinmaydi.
 *  • Ruxsat va hisob-kitob — mavjud qatlamdan: `botChaqiruv` (telegram-amal.ts) so'rovni middleware → shlyuzdan o'tkazadi
 *    (sb, hujjat-aylanish, ai-savol [aiHisobli: limit + token yechish], hujjat-yukla, foto-dalil). Bot yangi hisob/ruxsat yozmaydi.
 *  • O'qish buyruqlari (/bugun, /obyektlar) hech narsa yozmaydi. Yozish: faqat foto-dalil (umumiy, summasiz) va hujjat qarori
 *    (ikki bosqichli tasdiq, mavjud t2_hujjat_zanjir_qaror_v1 — rol/navbat bazada tekshiriladi).
 *  • Fakt summasi/hajmi YOZILMAYDI. Xabar matni, rasm, summa, chat_id loglanmaydi.
 */
import { type TgEnv, type TgTil, miniAppYoliTugma, saytUrl, tgFaylOl, tgRpc, tgT } from './telegram';
import { type Kutilgan, sinovniSuz } from './telegram-holat';
import { botChaqiruv } from './telegram-amal';
import { FOTO_BOLIMLAR } from './telegram-tugma';
import { onRequest as middleware } from '../api/_middleware';
import { onRequestGet as aylanishGet } from '../api/hujjat-aylanish';
import { onRequestPost as sbPost } from '../api/sb';
import { onRequestPost as aiSavolPost } from '../api/ai-savol';
import { onRequestPost as yuklaPost } from '../api/hujjat-yukla';
import { onRequestPost as fotoDalilPost } from '../api/foto-dalil';

export type BotJavob = { matn: string; markup?: Record<string, unknown>; /** Xabar bilan bog'liq obyekt (menyu tugmasini shunga o'rnatish uchun). */ obyektId?: number;
  /** Matnda ko'rinmaydigan belgilar (tasdiq tokeni): text_link entity — xom `#OB:…` matnda chiqmaydi. */ entities?: Record<string, unknown>[];
  /** Yuborilgach chat holatiga yoziladi: keyingi oddiy xabar shu amalni yakunlaydi (telegram-holat.ts). */ kutish?: Kutilgan };
type BotEnv = TgEnv & Record<string, unknown>;

/* ───────── yengil limit (bitta isolate ichida; asosiy limit — bazada t2_telegram_update_qabul_v1, 20/daq) ───────── */
const TARIX = new Map<string, number[]>();
/** `true` — limitdan oshdi (chaqiruv hisobga olinmaydi). */
export function limitOshdi(kalit: string, maks: number, oynaMs = 60_000, hozir = Date.now()): boolean {
  if (TARIX.size > 5000) TARIX.clear();
  const t = (TARIX.get(kalit) ?? []).filter((x) => hozir - x < oynaMs);
  if (t.length >= maks) { TARIX.set(kalit, t); return true; }
  t.push(hozir); TARIX.set(kalit, t); return false;
}
export const limitTozala = () => TARIX.clear();

const musbat = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
export const IJRO_ROLLARI = new Set(['superadmin', 'admin', 'boss', 'rahbar', 'director', 'bugalter', 'pto', 'prorab']);

type Men = { ok?: boolean; foydalanuvchi?: { ism?: string | null; login?: string | null }; platform_role?: string;
  azoliklar?: { kompaniya_id?: number; nom?: string; rol?: string; faol?: boolean }[] };
async function menOl(env: BotEnv, uid: number) { return tgRpc<Men>(env, 't2_men_v1', { p_actor_id: uid }); }
const azolik = (m: Men) => (m.azoliklar ?? []).filter((a) => a.faol !== false && musbat(a.kompaniya_id)).slice(0, 10);

/* ───────── /bugun — faqat o'qish ───────── */
export type BugunSonlar = { tasdiq: number | null; f2Qoralama: number | null; faktQoralama: number | null; rol: string };

export async function bugunSonlari(env: BotEnv, uid: number): Promise<BugunSonlar | null> {
  const m = await menOl(env, uid);
  if (!m?.ok) return null;
  const kk = azolik(m);
  const rol = m.platform_role === 'superadmin' ? 'superadmin' : (kk[0]?.rol ?? '');
  // Tasdiq kutayotgan hujjatlar: har kompaniya uchun mavjud «kiruvchi» o'qish (a'zolik/rol bazada); ruxsatsiz kompaniya jim o'tkaziladi.
  let tasdiq: number | null = null;
  const kir = await Promise.all(kk.map((a) => botChaqiruv<{ ok?: boolean; sanoq?: { zanjir?: number } }>(env, uid,
    { api: 'hujjat-aylanish', method: 'GET', query: { bolim: 'kiruvchi', kompaniya_id: a.kompaniya_id as number } }, middleware, aylanishGet)));
  for (const r of kir) if (r.status === 200 && r.body?.ok && Number.isFinite(r.body.sanoq?.zanjir)) tasdiq = (tasdiq ?? 0) + (r.body.sanoq?.zanjir as number);
  // F-2 va fakt qoralamalari: mavjud `sb` o'qish shlyuzi (tenant filtri + f2/fakt o'qish ruxsati serverda).
  const sanash = async (tur: string): Promise<number | null> => {
    const r = await botChaqiruv<{ ok?: boolean; soni?: number; jamiServerda?: number | null }>(env, uid,
      { api: 'sb', json: { jadval: 't2_akt', filtr: `tur=eq.${tur}&lifecycle_status=eq.draft`, ustunlar: 'id', limit: 1000 } }, middleware, sbPost);
    if (r.status !== 200 || !r.body?.ok) return null;
    const n = r.body.jamiServerda ?? r.body.soni;
    return Number.isFinite(n) ? n as number : null;
  };
  const ijro = IJRO_ROLLARI.has(rol);
  const [f2Qoralama, faktQoralama] = ijro ? await Promise.all([sanash('f2'), sanash('fakt')]) : [null, null];
  return { tasdiq, f2Qoralama, faktQoralama, rol };
}

const korsat = (n: number | null) => (n == null ? '—' : String(n));

export function bugunMatni(s: BugunSonlar, til: TgTil): string {
  return [
    tgT('Bugun — qisqa xulosa', til),
    tgT('Tasdiq kutayotgan hujjatlar: {n}', til, { n: korsat(s.tasdiq) }),
    ...(IJRO_ROLLARI.has(s.rol) ? [
      tgT('F-2 qoralamalari: {n}', til, { n: korsat(s.f2Qoralama) }),
      tgT('Tugallanmagan fakt (qoralama): {n}', til, { n: korsat(s.faktQoralama) }),
    ] : []),
    tgT('Batafsil — Mini App da.', til),
  ].join('\n');
}

export function bugunTugmalari(env: TgEnv, til: TgTil) {
  return { inline_keyboard: [
    [miniAppYoliTugma(env, til, '/admin/hujjat-aylanish', 'Tasdiqlar'), miniAppYoliTugma(env, til, '/admin/fakt', 'Fakt')],
    [miniAppYoliTugma(env, til, '/admin/f2-reestr', 'F-2 reestri'), miniAppYoliTugma(env, til, '/admin/obyektlar', 'Obyektlar')],
  ] };
}

export async function bugunJavobi(env: BotEnv, uid: number, til: TgTil): Promise<BotJavob> {
  const s = await bugunSonlari(env, uid);
  if (!s) return { matn: tgT('Ma’lumotni o‘qib bo‘lmadi. Birozdan keyin urinib ko‘ring.', til) };
  return { matn: bugunMatni(s, til), markup: bugunTugmalari(env, til) };
}

/* ───────── /obyektlar ───────── */
export type ObyektQator = { id: number; nom: string; kompaniya_id: number };
export async function obyektlarOl(env: BotEnv, uid: number, limit = 12): Promise<ObyektQator[] | null> {
  // Sinov obyektlari (SINOV…) haqiqiy ro'yxatda chiqmaydi: ularni suzish uchun ko'proq olinadi (telegram-holat.ts).
  const r = await botChaqiruv<{ ok?: boolean; qatorlar?: { id?: number; nom?: string; kompaniya_id?: number }[] }>(env, uid,
    { api: 'sb', json: { jadval: 't2_obyekt', filtr: 'holat=eq.faol', ustunlar: 'id,nom,kompaniya_id', tartib: 'yangilandi.desc', limit: Math.max(limit, 50) } }, middleware, sbPost);
  if (r.status !== 200 || !r.body?.ok || !Array.isArray(r.body.qatorlar)) return null;
  return sinovniSuz(r.body.qatorlar.filter((q) => musbat(q.id) && musbat(q.kompaniya_id))).slice(0, limit)
    .map((q) => ({ id: q.id as number, nom: String(q.nom ?? '—').replace(/\s+/g, ' ').slice(0, 80), kompaniya_id: q.kompaniya_id as number }));
}

async function obyektBitta(env: BotEnv, uid: number, id: number): Promise<ObyektQator | undefined> {
  const r = await botChaqiruv<{ ok?: boolean; qatorlar?: { id?: number; nom?: string; kompaniya_id?: number }[] }>(env, uid,
    { api: 'sb', json: { jadval: 't2_obyekt', filtr: `id=eq.${id}&holat=eq.faol`, ustunlar: 'id,nom,kompaniya_id', limit: 1 } }, middleware, sbPost);
  const q = r.status === 200 && r.body?.ok && Array.isArray(r.body.qatorlar) ? r.body.qatorlar.find((x) => x.id === id) : undefined;
  return q && musbat(q.id) && musbat(q.kompaniya_id) ? { id: q.id, nom: String(q.nom ?? '—').replace(/\s+/g, ' ').slice(0, 80), kompaniya_id: q.kompaniya_id } : undefined;
}

export async function obyektlarJavobi(env: BotEnv, uid: number, til: TgTil): Promise<BotJavob> {
  const q = await obyektlarOl(env, uid);
  if (!q) return { matn: tgT('Ma’lumotni o‘qib bo‘lmadi. Birozdan keyin urinib ko‘ring.', til) };
  if (!q.length) return { matn: tgT('Sizga ochiq obyekt topilmadi.', til), markup: { inline_keyboard: [[miniAppYoliTugma(env, til, '/admin/obyektlar', 'Obyektlar')]] } };
  return {
    matn: [tgT('Obyektlaringiz (oxirgi yangilanganlari):', til), ...q.map((o) => `• #${o.id} ${o.nom}`), tgT('Rasm yuborganda izohga #raqam yozing — rasm shu obyektga tushadi.', til)].join('\n'),
    markup: { inline_keyboard: [
      ...q.slice(0, 8).map((o) => [{ text: `#${o.id} ${o.nom}`.slice(0, 60), web_app: miniAppYoliTugma(env, til, '/admin/obyektlar').web_app }]),
      [miniAppYoliTugma(env, til, '/admin/obyektlar', 'Hammasi — Mini App da')],
    ] },
  };
}

/* ───────── /jarvis <savol> — mavjud ai-savol (aiHisobli: limit + token yechish) ───────── */
const JARVIS_MAX_SAVOL = 1000;
export async function jarvisJavobi(env: BotEnv, uid: number, til: TgTil, savol: string): Promise<BotJavob> {
  const s = savol.trim();
  if (!s) return { matn: tgT('Savolni buyruqdan keyin yozing: /jarvis <savol>', til) };
  if (s.length > JARVIS_MAX_SAVOL) return { matn: tgT('Savol juda uzun (1000 belgigacha).', til) };
  if (limitOshdi('jarvis:' + uid, 5)) return { matn: tgT('Juda ko‘p so‘rov. Bir daqiqadan keyin urinib ko‘ring.', til) };
  const r = await botChaqiruv<{ ok?: boolean; javob?: string; xabar?: string; code?: string; dalil?: { yol?: string } }>(env, uid,
    { api: 'ai-savol', json: { savol: s } }, middleware, aiSavolPost);
  if (r.status === 200 && r.body?.ok && typeof r.body.javob === 'string' && r.body.javob.trim()) {
    const yol = r.body.dalil?.yol;
    if (!yol) return { matn: r.body.javob.trim().slice(0, 3800) };
    if (yol.startsWith('/api/normativ-qidir?')) {
      const absolute = saytUrl(env) + yol;
      const suffix = '\n\n[Normativ manbasini ochish](' + yol + ')';
      const answer = r.body.javob.endsWith(suffix) ? r.body.javob.slice(0, -suffix.length) : r.body.javob;
      return { matn: answer.trim().slice(0, 3800), markup: { inline_keyboard: [[{ text: tgT('Tizimni ochish', til), url: absolute }]] } };
    }
    const sourceLink = '\n\n[Manbani ochish](' + yol + ')';
    const answer = r.body.javob.endsWith(sourceLink) ? r.body.javob.slice(0, -sourceLink.length) : r.body.javob;
    return { matn: answer.trim().slice(0, 3800), markup: { inline_keyboard: [[miniAppYoliTugma(env, til, yol)]] } };
  }
  // Byudjet/limit rad — server xabari (matn tayyor, sirsiz); kompaniya tanlanmagan/ruxsat yo'q — Mini App ga yo'naltiramiz.
  if (r.status === 402 && typeof r.body?.xabar === 'string') return { matn: r.body.xabar.slice(0, 300) };
  if ([403, 422].includes(r.status)) return { matn: tgT('Jarvis kompaniyani aniqlay olmadi yoki ruxsat yo‘q. Mini App da kompaniyani tanlab so‘rang.', til),
    markup: { inline_keyboard: [[miniAppYoliTugma(env, til, '/admin')]] } };
  return { matn: tgT('Jarvis hozir javob bera olmadi. Birozdan keyin urinib ko‘ring.', til) };
}

/* ───────── /kunlik on|off ───────── */
export async function kunlikAmali(env: BotEnv, uid: number, til: TgTil, arg: string): Promise<BotJavob> {
  const a = arg.trim().toLowerCase();
  const yoq = ['on', 'yoq', 'yoqish', 'вкл', 'on.'].includes(a) ? true : ['off', 'ochir', 'ochirish', 'выкл', 'off.'].includes(a) ? false : null;
  if (yoq === null) return { matn: tgT('Kunlik xulosa: /kunlik on — yoqish, /kunlik off — o‘chirish.', til) };
  const r = await tgRpc<{ ok?: boolean; bildirishnoma?: Record<string, boolean> }>(env, 't2_telegram_sozlama_v1', { p_actor_id: uid, p_bildirishnoma: { kunlik: yoq } });
  if (!r?.ok) return { matn: tgT('Sozlamani saqlab bo‘lmadi. Birozdan keyin urinib ko‘ring.', til) };
  // Eski baza `kunlik` kalitini jim e'tiborsiz qoldiradi (migratsiya 20261223000000 qo'llanmagan) — yolg'on «yoqildi» demaymiz.
  if (r.bildirishnoma?.kunlik !== yoq) return { matn: tgT('Kunlik xulosa hali serverda yoqilmagan (yangilanish kutilmoqda).', til) };
  return { matn: tgT(yoq ? 'Kunlik xulosa yoqildi. Har ertalab keladi.' : 'Kunlik xulosa o‘chirildi.', til) };
}

/* ───────── rasm → foto-dalil (umumiy, biriktirilmagan) ───────── */
export const FOTO_MAX_BAYT = 10 * 1024 * 1024;
export type TgRasm = { file_id?: string; file_size?: number; width?: number; height?: number };

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

export async function fotoAmali(env: BotEnv, uid: number, til: TgTil, rasmlar: TgRasm[], izoh: string): Promise<BotJavob> {
  const eng = [...rasmlar].filter((p) => typeof p.file_id === 'string').sort((a, b) => ((a.width ?? 0) * (a.height ?? 0)) - ((b.width ?? 0) * (b.height ?? 0))).at(-1);
  if (!eng?.file_id) return { matn: tgT('Rasm topilmadi.', til) };
  if (limitOshdi('foto:' + uid, 8)) return { matn: tgT('Juda ko‘p rasm. Bir daqiqadan keyin urinib ko‘ring.', til) };
  const obyektlar = await obyektlarOl(env, uid, 50);
  if (!obyektlar) return { matn: tgT('Ma’lumotni o‘qib bo‘lmadi. Birozdan keyin urinib ko‘ring.', til) };
  // «Joriy obyekt»: izohdagi #raqam → yagona obyekt → aks holda so'raymiz (taxmin qilinmaydi). Obyekt ro'yxati foydalanuvchiga ochiq obyektlardan.
  const hint = /(?:^|\s)#(\d{1,12})(?=\s|$)/.exec(izoh)?.[1];
  let obyekt: ObyektQator | undefined;
  if (hint) obyekt = obyektlar.find((o) => o.id === Number(hint)) ?? await obyektBitta(env, uid, Number(hint));   // aniq #raqam — sinov obyekt ham (ro'yxatda yashirin bo'lsa ham; ruxsat sb da)
  else if (obyektlar.length === 1) obyekt = obyektlar[0];
  if (!obyekt) {
    // Rasm saqlab qo'yiladi: foydalanuvchi obyekt raqamini yozsa («240») rasm qayta yuborilmasdan yakunlanadi (kutilgan niyat).
    return { matn: [tgT(hint ? 'Bu raqamli obyekt sizga ochiq emas.' : 'Qaysi obyektga? Raqamini yozing (masalan: 240):', til),
      ...obyektlar.slice(0, 8).map((o) => `• #${o.id} ${o.nom}`)].join('\n'),
    kutish: { tur: 'foto', fileId: eng.file_id, w: eng.width, h: eng.height, izoh: izoh.replace(/(?:^|\s)#\d{1,12}(?=\s|$)/g, ' ').trim() } };
  }
  const f = await tgFaylOl(env, eng.file_id, FOTO_MAX_BAYT);
  if (!f) return { matn: tgT('Rasmni olib bo‘lmadi (10 MB gacha rasm yuboring).', til) };
  const sha = hex(await crypto.subtle.digest('SHA-256', f.bayt));
  const op = crypto.randomUUID();
  const form = new FormData();
  form.set('fayl', new File([f.bayt], 'telegram-foto' + (f.mime === 'image/png' ? '.png' : f.mime === 'image/webp' ? '.webp' : '.jpg'), { type: f.mime }));
  form.set('kompaniya_id', String(obyekt.kompaniya_id)); form.set('obyekt_id', String(obyekt.id));
  form.set('turi', 'foto_dalil'); form.set('operation_id', op); form.set('sha256', sha); form.set('size', String(f.bayt.byteLength));
  // kompaniya/obyekt query da ham: middleware multipart tanasini o'qimaydi — nishon kompaniya shu yerdan aniqlanadi.
  const y = await botChaqiruv<{ ok?: boolean; document_id?: number }>(env, uid,
    { api: 'hujjat-yukla', form, query: { kompaniya_id: obyekt.kompaniya_id, obyekt_id: obyekt.id } }, middleware, yuklaPost);
  if (y.status !== 200 || !y.body?.ok || !musbat(y.body.document_id)) return { matn: tgT('Rasm saqlanmadi (ruxsat yo‘q yoki server xatosi).', til) };
  const b = await botChaqiruv<{ ok?: boolean; id?: number }>(env, uid,
    { api: 'foto-dalil', json: { amal: 'bogla', kompaniya_id: obyekt.kompaniya_id, obyekt_id: obyekt.id, document_id: y.body.document_id, manba_turi: 'umumiy',
      izoh: izoh.replace(/(?:^|\s)#\d{1,12}(?=\s|$)/g, ' ').trim().slice(0, 500) || null, operation_id: op } }, middleware, fotoDalilPost);
  if (b.status !== 200 || !b.body?.ok) return { matn: tgT('Rasm saqlandi, lekin dalilga bog‘lanmadi. Mini App da qayta urinib ko‘ring.', til),
    markup: { inline_keyboard: [[miniAppYoliTugma(env, til, '/admin/foto', 'Foto-dalil')]] } };
  // 2-bosqich: foto-dalil id si bo'lsa — qatorga biriktirish oqimi (Bo'lim → so'z → qator) callback tugmasi bilan boshlanadi.
  const fid = b.body.id;
  return { matn: tgT('Rasm «{obyekt}» obyektiga dalil sifatida saqlandi (hali faktga biriktirilmagan). Faktga biriktirish uchun tugmani bosing.', til, { obyekt: obyekt.nom }),
    markup: { inline_keyboard: [[miniAppYoliTugma(env, til, '/admin/foto', 'Faktga biriktirish')],
      ...(musbat(fid) ? [[{ text: tgT('Fakt qatoriga biriktirish', til), callback_data: `${FOTO_BOLIMLAR}${fid}:${obyekt.id}` }]] : [])] }, obyektId: obyekt.id };
}

/* ───────── callback (menyu). Hujjat tasdiqi va 2-bosqich oqimlari: telegram-bot-oqim.ts (callbackIshlaV2) ───────── */
export type Callback = { id?: string; from?: { id?: number; language_code?: string }; data?: string; message?: { message_id?: number; text?: string; entities?: { type?: string; url?: string }[]; chat?: { id?: number; type?: string } } };

/** Callback ishlovi. `uid` — chaqiruvchi (bog'lanishdan). Qaytadi: javob matni (answerCallbackQuery) + ixtiyoriy yangi xabar/markup tozalash. */
export async function callbackIshla(env: BotEnv, uid: number, til: TgTil, cb: Callback): Promise<{ toast: string; xabar?: BotJavob; tugmalarniOlibTashla?: boolean; amal: string }> {
  const d = String(cb.data ?? '').slice(0, 64);
  if (d === 'm:b') { const j = await bugunJavobi(env, uid, til); return { toast: '', xabar: j, amal: 'menyu_bugun' }; }
  if (d === 'm:o') { const j = await obyektlarJavobi(env, uid, til); return { toast: '', xabar: j, amal: 'menyu_obyekt' }; }
  if (d === 'm:y') return { toast: '', xabar: { matn: yordamMatni(til) }, amal: 'menyu_yordam' };
  return { toast: tgT('Noma’lum tugma', til), amal: 'nomalum' };
}

/* ───────── yordam/start matnlari ───────── */
export const yordamMatni = (til: TgTil) => [
  tgT('Buyruqlar:', til),
  '/bugun — ' + tgT('bugungi qisqa xulosa', til),
  '/obyektlar — ' + tgT('obyektlar ro‘yxati', til),
  '/jarvis — ' + tgT('Jarvis ga savol (tokenlar sarflanadi)', til),
  '/fakt — ' + tgT('fakt qoralamasi: /fakt <obyekt#> <nima va qancha> (tokenlar sarflanadi)', til),
  '/kunlik — ' + tgT('kunlik xulosani yoqish/o‘chirish', til),
  '/menyu — ' + tgT('asosiy menyu: obyekt, fakt, F-2, hujjat, tasdiqlar', til),
  '/til — ' + tgT('tilni o‘zgartirish (uz, ru, en)', til),
  '/tasdiqlar — ' + tgT('qaroringizni kutayotgan hujjatlar (Tasdiqlash / Rad)', til),
  '/men — ' + tgT('men kimman (hisob, kompaniya, rol)', til),
  '/username — ' + tgT('QURAI username’ingiz: /username <nom>', til),
  '/taklif — ' + tgT('odamni kompaniyaga taklif qilish: /taklif <@username|telefon|email> <rol>', til),
  '/ilova — ' + tgT('tizimni Telegram ichida ochish', til),
  '/chiqish — ' + tgT('Telegramni hisobdan uzish', til),
  '/yordam — ' + tgT('shu ro‘yxat', til),
  tgT('Rasm yuborsangiz (izohga #obyekt raqami) — foto-dalil sifatida saqlanadi.', til),
].join('\n');
