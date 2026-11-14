/**
 * kirish-emailsiz.ts — emailsiz kirish (taklif + Telegram telefon tasdiqlash) uchun umumiy sof yordamchilar.
 * Yangi sessiya mexanizmi YO'Q: sessiya `imzola` (_shared/auth) orqali, mavjud endpointlar bilan bir xil cookie.
 *
 * Maxfiy qiymatlar (kod, havola tokeni, nonce, brauzer siri) bazaga FAQAT HMAC xeshi (SESSIYA_KALIT) sifatida boradi;
 * har xesh o'z "tur" prefiksiga ega, shuning uchun bir turdagi xesh boshqa turda ishlamaydi.
 */
import { SESSIYA_MUDDAT_MS } from './auth';
import { supabaseBaseUrl } from './supabase-url';
import { tengSatr } from './telegram';

export { tengSatr };

export type KirishEnv = {
  SUPABASE_URL?: string; SUPABASE_KEY?: string; SESSIYA_KALIT?: string;
  /** '1' | 'true' bo'lsa yoqiladi. Sukut — O'CHIQ (egasi qo'lda yoqadi). */
  KIRISH_TAKLIF_YOQILGAN?: string; KIRISH_TELEGRAM_YOQILGAN?: string; KIRISH_TELEFON_YOQILGAN?: string;
  /** Taklif muddati, soat (1..720; sukut 72). */
  KIRISH_TAKLIF_MUDDAT_SOAT?: string;
  TELEGRAM_BOT_TOKEN?: string; TELEGRAM_BOT_USERNAME?: string; TELEGRAM_SAYT_URL?: string; TELEGRAM_WEBHOOK_SECRET?: string;
};

export const yoqilgan = (v: string | undefined): boolean => ['1', 'true'].includes(String(v ?? '').trim().toLowerCase());
export const taklifMuddatSoat = (env: KirishEnv): number => {
  const n = Math.floor(Number(env.KIRISH_TAKLIF_MUDDAT_SOAT));
  return Number.isFinite(n) && n >= 1 && n <= 720 ? n : 72;
};

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const json = (b: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(b, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
export const originYaroqsiz = (req: Request) => {
  const origin = req.headers.get('Origin');
  return req.headers.get('Sec-Fetch-Site') === 'cross-site' || (!!origin && origin !== new URL(req.url).origin);
};
export const sessCookie = (token: string) => `sess=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${Math.floor(SESSIYA_MUDDAT_MS / 1000)}`;

/** Server-tomon SQL t2_telefon_norm_v1 bilan BIR XIL qoida: faqat O'zbekiston (+998), E.164. Yaroqsiz — null. */
export function telefonNorm(p: unknown): string | null {
  const s = String(p ?? '').trim();
  if (!s || s.length > 24 || !/^\+?[0-9 ()./-]+$/.test(s)) return null;
  let d = s.replace(/[^0-9]/g, '');
  if (d.length === 9) d = '998' + d;
  return /^998[2-9][0-9]{8}$/.test(d) ? '+' + d : null;
}
/** Login qatori telefon ko'rinishidami (emailsiz, harfsiz)? Shunda /api/kirish telefon yo'lidan boradi. */
export const loginTelefonmi = (login: string): boolean => !login.includes('@') && /^\+?[0-9 ()./-]{9,24}$/.test(login.trim());

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export type XeshTuri = 'taklif-kod' | 'taklif-token' | 'tg-nonce' | 'tg-brauzer';
/** HMAC-SHA256(SESSIYA_KALIT, tur|qiymat) — hex. Qo'shimcha kontekst (masalan telefon) qiymatga kiradi. */
export async function xesh(tur: XeshTuri, qiymat: string, kalit: string, kontekst = ''): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(kalit), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${tur}|${kontekst}|${qiymat}`)));
}

/** Rejection sampling bilan bir tekis raqamli kod (8 xonali: 10_000_000..99_999_999). */
export function raqamliKod(xona = 8): string {
  const diapazon = 9 * 10 ** (xona - 1);
  const chegara = Math.floor(0x1_0000_0000 / diapazon) * diapazon;
  const q = new Uint32Array(1);
  do { crypto.getRandomValues(q); } while (q[0] >= chegara);
  return String(10 ** (xona - 1) + (q[0] % diapazon));
}
export const tasodifiyToken = (bayt = 24): string => { const b = new Uint8Array(bayt); crypto.getRandomValues(b); return b64url(b); };
export const TOKEN_FORMAT = /^[A-Za-z0-9_-]{24,64}$/;
export const NONCE_PREFIKS = 'kirish_';
export const nonceYaroqli = (n: string) => n.startsWith(NONCE_PREFIKS) && TOKEN_FORMAT.test(n.slice(NONCE_PREFIKS.length));

export async function ipBelgi(req: Request): Promise<string | null> {
  const ip = req.headers.get('CF-Connecting-IP') || '';
  if (!ip) return null;
  const x = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip + '|t2ozi'));
  return [...new Uint8Array(x)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sbRpc<T = Record<string, unknown>>(env: KirishEnv, nom: string, yuk: Record<string, unknown>): Promise<{ status: number; data: T | null }> {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return { status: 503, data: null };
  try {
    const r = await fetch(supabaseBaseUrl(env.SUPABASE_URL) + '/rest/v1/rpc/' + nom, {
      method: 'POST', headers: { apikey: env.SUPABASE_KEY, Authorization: 'Bearer ' + env.SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(yuk),
    });
    return { status: r.status, data: (await r.json().catch(() => null)) as T | null };
  } catch { return { status: 502, data: null }; }
}

export const kalitYaroqli = (k: string | undefined): k is string => String(k || '').trim().length >= 16;
