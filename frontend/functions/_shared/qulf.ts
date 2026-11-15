/**
 * QULF + TASDIQ (step-up) yadrosi: PIN xeshi, urinish/blok qoidasi, tasdiq tokeni, bir martalik challenge, qurilma kaliti (Android Keystore).
 * Hujjat: docs/architecture/QULF_VA_TASDIQ_V1.md. Sof funksiyalar (DB yo'q) -- testlar: qulf.test.ts.
 * PIN HECH QACHON logga yozilmaydi va ochiq saqlanmaydi: PBKDF2-SHA256 (100k = Cloudflare Workers chegarasi) + foydalanuvchiga xos tuz
 * + server pepper (SESSIYA_KALIT dan HMAC): faqat baza oqsa PIN'ni oflayn topib bo'lmaydi.
 */
import { base64url, unbase64url } from './desktop-device';

export const PIN_ITER = 100_000;
export const PIN_RE = /^\d{4,6}$/;
export const TASDIQ_MS = 5 * 60_000;
export const CHAQIRIQ_MS = 2 * 60_000;
export const QAYTA_KIRISH_YANGI_MS = 10 * 60_000;
export const BLOK_XATO = 5;
export const BLOK_MS = 15 * 60_000;
export const JAMI_XATO = 10;
export const TASDIQ_COOKIE = 'qulf_tasdiq';
export const TASDIQ_HEADER = 'X-Tasdiq';

export type Rejim = 'off' | 'pin' | 'biometric_or_pin';
export const REJIMLAR: readonly Rejim[] = ['off', 'pin', 'biometric_or_pin'];

const enc = new TextEncoder();
const teng = (a: string, b: string) => { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };

async function hmacB64(kalit: string, domen: string, body: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', enc.encode(kalit), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64url(new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(domen + '|' + body))));
}
export const sha256 = async (b: Uint8Array | string): Promise<Uint8Array> =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', typeof b === 'string' ? enc.encode(b) : (b as BufferSource)));

// ---- PIN ---------------------------------------------------------------------------------------------------------------
/** Oson PIN: bir xil raqamlar (0000), ketma-ket (1234, 4321), juft takror (1212). */
export function zaifPin(pin: string): boolean {
  if (!PIN_RE.test(pin)) return true;
  if (/^(\d)\1+$/.test(pin)) return true;
  const d = [...pin].map(Number);
  if (d.every((x, i) => i === 0 || x - d[i - 1] === 1) || d.every((x, i) => i === 0 || d[i - 1] - x === 1)) return true;
  if (/^(\d\d)\1+$/.test(pin)) return true;
  return false;
}

async function pinBaytlar(pin: string, uid: number, kalit: string, tuz: Uint8Array, iter: number): Promise<Uint8Array> {
  const pepper = await hmacB64(kalit, 'qulf-pin', `${uid}|${pin}`);
  const km = await crypto.subtle.importKey('raw', enc.encode(pepper), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: tuz as BufferSource, iterations: iter }, km, 256));
}
/** `pbkdf2-sha256$<iter>$<tuz>$<xesh>` */
export async function pinXesh(pin: string, uid: number, kalit: string, tuz: Uint8Array = crypto.getRandomValues(new Uint8Array(16))): Promise<string> {
  return `pbkdf2-sha256$${PIN_ITER}$${base64url(tuz)}$${base64url(await pinBaytlar(pin, uid, kalit, tuz, PIN_ITER))}`;
}
export async function pinTekshir(pin: string, uid: number, kalit: string, saqlangan: string | null | undefined): Promise<boolean> {
  if (!saqlangan || !PIN_RE.test(pin)) return false;
  const p = saqlangan.split('$');
  if (p.length !== 4 || p[0] !== 'pbkdf2-sha256') return false;
  const iter = Number(p[1]);
  if (!Number.isSafeInteger(iter) || iter < 1000 || iter > PIN_ITER) return false;
  try { return teng(base64url(await pinBaytlar(pin, uid, kalit, unbase64url(p[2]), iter)), p[3]); } catch { return false; }
}

// ---- Blok holati ---------------------------------------------------------------------------------------------------------
export type QulfQator = {
  foydalanuvchi_id: number; pin_hash: string | null; xato_soni: number; jami_xato: number;
  bloklangan_gacha: string | null; qayta_kirish_vaqti: string | null; bosh_vaqt_daq: number;
};
export type PinHolat = { ok: true } | { ok: false; code: 'PIN_YOQ' | 'BLOKLANGAN' | 'QAYTA_KIRISH_KERAK'; qolgan_soniya?: number };
/** `sessIat` -- sessiya chiqarilgan vaqt (ms). 10 xatodan keyin faqat shundan KEYIN qilingan to'liq kirish PIN'ni qayta ochadi. */
export function pinHolat(q: QulfQator | null, sessIat: number, hozir: number): PinHolat {
  if (!q || !q.pin_hash) return { ok: false, code: 'PIN_YOQ' };
  const qk = q.qayta_kirish_vaqti ? Date.parse(q.qayta_kirish_vaqti) : 0;
  if (qk && sessIat <= qk) return { ok: false, code: 'QAYTA_KIRISH_KERAK' };
  const b = q.bloklangan_gacha ? Date.parse(q.bloklangan_gacha) : 0;
  if (b && b > hozir) return { ok: false, code: 'BLOKLANGAN', qolgan_soniya: Math.ceil((b - hozir) / 1000) };
  return { ok: true };
}
/** Parolsiz PIN almashtirish: faqat yangi to'liq kirishdan keyin (10 daqiqa ichida) va 10-xato bloki ostida bo'lmagan sessiya. */
export const yangiKirishmi = (sessIat: number, hozir: number) => hozir - sessIat <= QAYTA_KIRISH_YANGI_MS && hozir >= sessIat;

// ---- Tasdiq tokeni (5 daqiqa) --------------------------------------------------------------------------------------------
export type TasdiqYuk = { u: number; j: string; e: number; m: 'pin' | 'passkey' | 'qurilma' };
/** j -- web: sessiya jti; mobil (BFF har so'rovda yangi jti beradi): 'm'. */
export async function tasdiqYarat(yuk: { u: number; j: string; m: TasdiqYuk['m'] }, kalit: string, hozir = Date.now()): Promise<string> {
  const body = base64url(enc.encode(JSON.stringify({ ...yuk, e: hozir + TASDIQ_MS })));
  return body + '.' + await hmacB64(kalit, 'qulf-tasdiq', body);
}
export async function tasdiqTekshir(token: string | null | undefined, kalit: string, kutilgan: { u: number; j: string }, hozir = Date.now()): Promise<TasdiqYuk | null> {
  if (!token || token.length > 600) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !teng(parts[1], await hmacB64(kalit, 'qulf-tasdiq', parts[0]))) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(unbase64url(parts[0]))) as TasdiqYuk;
    if (p.u !== kutilgan.u || p.j !== kutilgan.j || !Number.isSafeInteger(p.e) || hozir > p.e || hozir < p.e - TASDIQ_MS - 1000) return null;
    return p;
  } catch { return null; }
}
export function tasdiqCookie(token: string): string {
  return `${TASDIQ_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${TASDIQ_MS / 1000}`;
}
/** Manbalar: X-Tasdiq sarlavhasi (native BFF), _tasdiq so'rov parametri (Windows ilova: yo'l BFF tanasi ichida, URL logiga tushmaydi), HttpOnly cookie (veb). */
export function tasdiqOl(request: Request): string | null {
  const h = request.headers.get(TASDIQ_HEADER);
  if (h) return h;
  try { const q = new URL(request.url).searchParams.get('_tasdiq'); if (q) return q; } catch { /* yaroqsiz URL */ }
  return request.headers.get('Cookie')?.match(new RegExp(`(?:^|;\\s*)${TASDIQ_COOKIE}=([^;]+)`))?.[1] ?? null;
}

// ---- Bir martalik challenge ------------------------------------------------------------------------------------------------
export type ChaqiriqMaqsad = 'reg' | 'kirish' | 'qreg' | 'qkirish';
export type ChaqiriqYuk = { u: number; p: ChaqiriqMaqsad; n: string; e: number; j: string };
/** `n` -- 32 bayt tasodifiy (WebAuthn challenge / Android imzolaydigan matn). Token imzolangan, `jti` = token imzosi (bir martalik: DB). */
export async function chaqiriqYarat(u: number, p: ChaqiriqMaqsad, kalit: string, hozir = Date.now()): Promise<{ token: string; n: string; jti: string }> {
  const n = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const j = base64url(crypto.getRandomValues(new Uint8Array(16)));
  const body = base64url(enc.encode(JSON.stringify({ u, p, n, e: hozir + CHAQIRIQ_MS, j } satisfies ChaqiriqYuk)));
  return { token: body + '.' + await hmacB64(kalit, 'qulf-chaqiriq', body), n, jti: j };
}
export async function chaqiriqTekshir(token: unknown, kalit: string, u: number, p: ChaqiriqMaqsad, hozir = Date.now()): Promise<ChaqiriqYuk | null> {
  if (typeof token !== 'string' || token.length > 600) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !teng(parts[1], await hmacB64(kalit, 'qulf-chaqiriq', parts[0]))) return null;
  try {
    const y = JSON.parse(new TextDecoder().decode(unbase64url(parts[0]))) as ChaqiriqYuk;
    if (y.u !== u || y.p !== p || typeof y.n !== 'string' || typeof y.j !== 'string' || !Number.isSafeInteger(y.e) || hozir > y.e) return null;
    return y;
  } catch { return null; }
}

// ---- Siyosat -------------------------------------------------------------------------------------------------------------------
export type Talab = { talab: boolean; rejim: Rejim; pin: boolean; kalit: boolean };
/** Qabul qilinadigan usullar: 'pin' -- faqat PIN; 'biometric_or_pin' -- PIN yoki passkey/qurilma kaliti. */
export function qabulUsullar(rejim: Rejim, t: { pin: boolean; kalit: boolean }): ('pin' | 'passkey' | 'qurilma')[] {
  if (rejim === 'off') return [];
  const u: ('pin' | 'passkey' | 'qurilma')[] = [];
  if (t.pin) u.push('pin');
  if (rejim === 'biometric_or_pin' && t.kalit) u.push('passkey', 'qurilma');
  return u;
}
export const rejimYaroqli = (r: unknown): r is Rejim => typeof r === 'string' && (REJIMLAR as readonly string[]).includes(r);

// ---- Qurilma kaliti (Android Keystore, ES256) -------------------------------------------------------------------------------------
/** DER ECDSA imzo (SEQ{INT r, INT s}) -> 64 bayt r||s (WebCrypto). */
export function derDanRaw(der: Uint8Array): Uint8Array | null {
  try {
    let i = 0;
    if (der[i++] !== 0x30) return null;
    let len = der[i++];
    if (len & 0x80) { const nb = len & 0x7f; if (nb < 1 || nb > 2) return null; len = 0; for (let k = 0; k < nb; k++) len = (len << 8) | der[i++]; }
    if (i + len !== der.length) return null;
    const out = new Uint8Array(64);
    for (let part = 0; part < 2; part++) {
      if (der[i++] !== 0x02) return null;
      let l = der[i++];
      if (l === 0 || l > 33 || i + l > der.length) return null;
      let v = der.slice(i, i + l); i += l;
      while (v.length > 32 && v[0] === 0) v = v.slice(1);
      if (v.length > 32) return null;
      out.set(v, part * 32 + (32 - v.length));
    }
    return i === der.length ? out : null;
  } catch { return null; }
}
export async function ecSpkiImport(spki: Uint8Array): Promise<CryptoKey | null> {
  try { return await crypto.subtle.importKey('spki', spki as BufferSource, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']); } catch { return null; }
}
export async function ecImzoTekshir(key: CryptoKey, xabar: Uint8Array, derImzo: Uint8Array): Promise<boolean> {
  const raw = derDanRaw(derImzo);
  if (!raw) return false;
  try { return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, raw as BufferSource, xabar as BufferSource); } catch { return false; }
}
/** Android imzolaydigan matn: `QULF1|<maqsad>|<n>|<kredensial_id>` (UTF-8). Challenge tokeni foydalanuvchiga bog'langan, shuning uchun uid matnda yo'q. */
export const qurilmaXabar = (maqsad: 'reg' | 'kirish', n: string, kredId: string) => enc.encode(`QULF1|${maqsad}|${n}|${kredId}`);
/** Kredensial id = SHA-256(SPKI) base64url -- mijoz tanlamaydi, server hisoblaydi. */
export async function kredensialIdDan(spki: Uint8Array): Promise<string> { return base64url(await sha256(spki)); }
