/**
 * telegram.ts — @qur_uz_bot + Telegram Mini App umumiy (sof) mantiqi (egasi 2026-10-28, PR 1 poydevor).
 *
 * XAVFSIZLIK QOIDALARI:
 *  • Bot tokeni FAQAT Cloudflare Pages secret `TELEGRAM_BOT_TOKEN` dan; hech qachon log/javob/xatoga yozilmaydi.
 *    Telegram API manzili (token ichida) hech qayerga chiqarilmaydi — xato bo'lsa faqat `ok:false` qaytadi.
 *  • Webhook: `X-Telegram-Bot-Api-Secret-Token` == `TELEGRAM_WEBHOOK_SECRET` (vaqt-barqaror solishtirish); sir yo'q → fail closed.
 *  • Mini App: initData HMAC (secret = HMAC_SHA256(key="WebAppData", msg=bot_token)) + auth_date yangiligi SERVERDA.
 *  • Telegram hisobi faqat bog'langan t2_foydalanuvchi sifatida ishlaydi — ruxsatlar mavjud qatlamdan (t2_men_v1 + middleware).
 *  • Xabar matni, username, telefon logga yozilmaydi va bazada saqlanmaydi.
 */
import { supabaseBaseUrl } from './supabase-url';
import matnlar from '../../src/i18n/lugat/qism/telegram-bot.json';
import kirishMatnlar from '../../src/i18n/lugat/qism/telegram-kirish.json';

export type TgEnv = {
  SUPABASE_URL?: string; SUPABASE_KEY?: string; SESSIYA_KALIT?: string;
  TELEGRAM_BOT_TOKEN?: string; TELEGRAM_WEBHOOK_SECRET?: string; TELEGRAM_BOT_USERNAME?: string; TELEGRAM_SAYT_URL?: string;
};
export type TgTil = 'uz' | 'ru' | 'en';

export const STANDART_BOT = 'qur_uz_bot';
export const STANDART_SAYT = 'https://smeta-tizimi.pages.dev';
/** Mini App initData yaroqlilik muddati (soniya). Mini App ochilgach bir soat ichida kirish kerak. */
export const INIT_DATA_MAX_YOSH = 3600;
/** Ulash kodi muddati (bazada ham 10 daqiqa). */
export const ULASH_KOD_DAQIQA = 10;

export const botNomi = (env: TgEnv) => (env.TELEGRAM_BOT_USERNAME || STANDART_BOT).replace(/^@/, '').trim();
export const saytUrl = (env: TgEnv) => (env.TELEGRAM_SAYT_URL || STANDART_SAYT).replace(/\/+$/, '');
export const miniAppUrl = (env: TgEnv) => saytUrl(env) + '/tg';
export const tokenBormi = (env: TgEnv) => /^\d+:[A-Za-z0-9_-]{20,}$/.test(String(env.TELEGRAM_BOT_TOKEN || '').trim());

/* ───────── i18n (lugat/qism/telegram-bot.json; kalit = o'zbek lotin matn) ───────── */
const LUG = { ...(matnlar as Record<string, { ru: string; en: string }>), ...(kirishMatnlar as Record<string, { ru: string; en: string }>) };
export function tilAniqla(languageCode: unknown): TgTil {
  const s = String(languageCode || '').toLowerCase();
  return s.startsWith('ru') ? 'ru' : s.startsWith('en') ? 'en' : 'uz';
}
export function tgT(kalit: string, til: TgTil | null | undefined, p?: Record<string, string | number>): string {
  const s = til === 'ru' || til === 'en' ? (LUG[kalit]?.[til] ?? kalit) : kalit;
  return p ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in p ? String(p[k]) : m)) : s;
}

/* ───────── kripto yordamchilar ───────── */
const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, enc.encode(data));
}
/** Vaqt-barqaror satr solishtirish. */
export function tengSatr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/* ───────── Webhook sirini tekshirish ───────── */
export function webhookSirTekshir(req: Request, sir: string | undefined): 'ok' | 'sozlanmagan' | 'rad' {
  const kutilgan = String(sir || '').trim();
  if (kutilgan.length < 16) return 'sozlanmagan';
  const kelgan = req.headers.get('X-Telegram-Bot-Api-Secret-Token') || '';
  return tengSatr(kelgan, kutilgan) ? 'ok' : 'rad';
}

/* ───────── Mini App initData ───────── */
export type TgFoydalanuvchi = { id: number; language_code?: string; first_name?: string };
export type InitNatija = { ok: true; user: TgFoydalanuvchi; authDate: number } | { ok: false; sabab: 'BOSH' | 'HASH_YOQ' | 'IMZO_NOTOGRI' | 'MUDDATI_OTGAN' | 'KELAJAK' | 'USER_YOQ' };

/** Telegram hujjati: data_check_string = hash dan boshqa barcha maydonlar, kalit bo'yicha saralangan, `k=v`, `\n` bilan.
 *  secret_key = HMAC_SHA256(key="WebAppData", msg=bot_token); hash = hex(HMAC_SHA256(key=secret_key, msg=data_check_string)). */
export async function initDataTekshir(initData: string, botToken: string, hozirSek = Math.floor(Date.now() / 1000), maxYosh = INIT_DATA_MAX_YOSH): Promise<InitNatija> {
  if (!initData || initData.length > 8192 || !botToken) return { ok: false, sabab: 'BOSH' };
  let p: URLSearchParams;
  try { p = new URLSearchParams(initData); } catch { return { ok: false, sabab: 'BOSH' }; }
  const hash = (p.get('hash') || '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hash)) return { ok: false, sabab: 'HASH_YOQ' };
  const juftlar: string[] = [];
  for (const [k, v] of p.entries()) if (k !== 'hash') juftlar.push(`${k}=${v}`);
  juftlar.sort();
  const sirKalit = await hmac(enc.encode('WebAppData'), botToken);
  const hisob = hex(await hmac(sirKalit, juftlar.join('\n')));
  if (!tengSatr(hisob, hash)) return { ok: false, sabab: 'IMZO_NOTOGRI' };
  const authDate = Number(p.get('auth_date'));
  if (!Number.isSafeInteger(authDate) || authDate <= 0) return { ok: false, sabab: 'MUDDATI_OTGAN' };
  if (authDate > hozirSek + 60) return { ok: false, sabab: 'KELAJAK' };
  if (hozirSek - authDate > maxYosh) return { ok: false, sabab: 'MUDDATI_OTGAN' };
  let user: TgFoydalanuvchi | null = null;
  try { user = JSON.parse(p.get('user') || 'null') as TgFoydalanuvchi | null; } catch { user = null; }
  if (!user || !Number.isSafeInteger(user.id) || user.id <= 0) return { ok: false, sabab: 'USER_YOQ' };
  return { ok: true, user: { id: user.id, language_code: user.language_code, first_name: user.first_name }, authDate };
}

/** Testlar va lokal sinov uchun: initData ni imzolaydi (Telegram serverining o'zi shunday quradi). */
export async function initDataImzola(maydonlar: Record<string, string>, botToken: string): Promise<string> {
  const juftlar = Object.entries(maydonlar).map(([k, v]) => `${k}=${v}`).sort();
  const sirKalit = await hmac(enc.encode('WebAppData'), botToken);
  const hash = hex(await hmac(sirKalit, juftlar.join('\n')));
  const p = new URLSearchParams(maydonlar); p.set('hash', hash);
  return p.toString();
}

/* ───────── Ulash kodi (bir martalik; bazada faqat SHA-256 xesh) ───────── */
export function ulashKodYarat(): string {
  const b = new Uint8Array(24); crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); // 32 belgi, t.me start ga mos
}
export const ulashKodYaroqli = (kod: string) => /^[A-Za-z0-9_-]{16,64}$/.test(kod);
export async function ulashKodXesh(kod: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode('tg-ulash:' + kod)));
}
export const deepLink = (env: TgEnv, kod: string) => `https://t.me/${botNomi(env)}?start=${encodeURIComponent(kod)}`;

/* ───────── Supabase RPC (service_role, faqat server) ───────── */
export async function tgRpc<T = Record<string, unknown>>(env: TgEnv, nom: string, yuk: Record<string, unknown>): Promise<T | null> {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return null;
  try {
    const r = await fetch(supabaseBaseUrl(env.SUPABASE_URL) + '/rest/v1/rpc/' + nom, {
      method: 'POST', headers: { apikey: env.SUPABASE_KEY, Authorization: 'Bearer ' + env.SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(yuk),
    });
    if (!r.ok) return null;
    return await r.json().catch(() => null) as T | null;
  } catch { return null; }
}

/* ───────── Telegram Bot API ───────── */
/** Token hech qachon qaytarilmaydi/loglanmaydi. Xato bo'lsa — faqat `{ ok:false, description? }` (Telegram matni, tokensiz). */
export async function tgApi<T = unknown>(env: TgEnv, metod: string, yuk: Record<string, unknown>): Promise<{ ok: boolean; result?: T; description?: string }> {
  const token = String(env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!tokenBormi(env) || !/^[A-Za-z]+$/.test(metod)) return { ok: false, description: 'TOKEN_YOQ' };
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/${metod}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(yuk),
    });
    const j = await r.json().catch(() => null) as { ok?: boolean; result?: T; description?: string } | null;
    const desc = typeof j?.description === 'string' ? j.description.split(token).join('***').slice(0, 200) : undefined;
    return { ok: !!j?.ok, result: j?.result, description: desc };
  } catch { return { ok: false, description: 'TARMOQ' }; }
}

export function miniAppTugma(env: TgEnv, til: TgTil | null) {
  return { inline_keyboard: [[{ text: tgT('Tizimni ochish', til), web_app: { url: miniAppUrl(env) } }]] };
}

export async function xabarYubor(env: TgEnv, chatId: number, matn: string, qoshimcha: Record<string, unknown> = {}): Promise<boolean> {
  // parse_mode yo'q — oddiy matn (foydalanuvchi kiritgan sarlavhalar HTML/Markdown in'ektsiyasi bo'lmasin).
  const r = await tgApi(env, 'sendMessage', { chat_id: chatId, text: matn.slice(0, 4000), disable_web_page_preview: true, ...qoshimcha });
  return r.ok;
}

/* ───────── Bildirishnoma kanali ───────── */
export type BildirishnomaTur = 'topshiriq' | 'f2' | 'signal';
/**
 * Bog'langan va shu turga rozi bo'lgan foydalanuvchiga Telegram xabari. Ulanmagan/rozi emas/token yo'q — jim `false`.
 * `matn` — kalit (o'zbek lotin) + o'rinbosarlar; qabul qiluvchining tilida yuboriladi. Hech narsa loglanmaydi.
 */
export async function telegramYubor(env: TgEnv, foydalanuvchiId: number, kalit: string, p?: Record<string, string | number>, tur: BildirishnomaTur = 'topshiriq'): Promise<boolean> {
  if (!tokenBormi(env) || !Number.isSafeInteger(foydalanuvchiId) || foydalanuvchiId <= 0) return false;
  const m = await tgRpc<{ ok?: boolean; yuborish?: boolean; chat_id?: number; til?: TgTil | null }>(env, 't2_telegram_manzil_v1', { p_foydalanuvchi_id: foydalanuvchiId, p_tur: tur });
  if (!m?.ok || !m.yuborish || !Number.isSafeInteger(m.chat_id)) return false;
  return xabarYubor(env, m.chat_id as number, tgT(kalit, m.til ?? 'uz', p), { reply_markup: miniAppTugma(env, m.til ?? 'uz') });
}

/** Pages `ctx.waitUntil` bo'lmasa (test) — promise jim kutiladi; xato hech qachon asosiy javobni buzmaydi. */
export function fonda(ctx: { waitUntil?: (p: Promise<unknown>) => void }, p: Promise<unknown>): void {
  const xavfsiz = p.catch(() => undefined);
  try { if (typeof ctx.waitUntil === 'function') { ctx.waitUntil(xavfsiz); return; } } catch { /* test muhiti */ }
  void xavfsiz;
}
