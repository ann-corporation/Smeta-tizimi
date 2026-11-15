/**
 * mobil-bilet.ts — bir martalik (30 s) VEB-KIRISH BILETI: native ilova WebView'ida saytning hali native bo'lmagan sahifasini ochish.
 * Bilet: base64url(JSON{u,r,y,e,n}).HMAC-SHA256 (SESSIYA_KALIT, «mobil-web-bilet|» domen ajratgich). Faqat tasdiqlangan qurilma Bearer'i
 * bilan beriladi (api/mobil/web-bilet); `api/mobil/web-kirish` uni qisqa umrli (8 soat) `sess` cookie'ga almashtiradi va FAQAT
 * bilet ichidagi /admin yo'liga yo'naltiradi. Bilet ichida rol/ruxsat qarori YO'Q: har so'rovda baribir bazadan yangi vakolat olinadi.
 */
import { imzola, SESSIYA_MUDDAT_MS, tekshir, type Rol, type Sess } from './auth';
import { base64url, desktopRpc, positiveId, unbase64url, uuid, type DesktopEnv } from './desktop-device';
import { supabaseBaseUrl } from './supabase-url';

export const BILET_MS = 30_000;
/** WebView cookie: 2 h SLIDING (refreshed while in use, capped by WEB_MAX_MS from the first issue) and bound to the device. */
export const WEB_SESSIYA_MS = 2 * 3600_000;
export const WEB_MAX_MS = 12 * 3600_000;
export const WEB_YANGILASH_MS = 5 * 60_000;
export const BILET_YOL = /^\/admin(?:\/[A-Za-z0-9_.~-]+)*(?:\?[A-Za-z0-9_=&.%-]*)?$/;
export const biletYolYaroqli = (y: unknown): y is string => typeof y === 'string' && y.length <= 200 && !y.includes('..') && BILET_YOL.test(y);

export type BiletYuk = { u: number; r: string; y: string; e: number; n: string; d: string; h: string };

async function hmac(body: string, kalit: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(kalit), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64url(new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode('mobil-web-bilet|' + body))));
}
const teng = (a: string, b: string) => { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };

export async function biletYarat(yuk: { u: number; r: string; y: string; d: string; h: string }, kalit: string, hozir = Date.now()): Promise<string> {
  const p: BiletYuk = { ...yuk, e: hozir + BILET_MS, n: crypto.randomUUID() };
  const body = base64url(new TextEncoder().encode(JSON.stringify(p)));
  return body + '.' + await hmac(body, kalit);
}

export async function biletTekshir(bilet: string, kalit: string, hozir = Date.now()): Promise<BiletYuk | null> {
  const parts = bilet.split('.');
  if (parts.length !== 2 || bilet.length > 1024) return null;
  if (!teng(parts[1], await hmac(parts[0], kalit))) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(unbase64url(parts[0]))) as BiletYuk;
    if (!Number.isSafeInteger(p.u) || p.u <= 0 || typeof p.r !== 'string' || !biletYolYaroqli(p.y) || !Number.isSafeInteger(p.e) || hozir > p.e ||
      typeof p.d !== 'string' || typeof p.h !== 'string' || typeof p.n !== 'string') return null;
    return p;
  } catch { return null; }
}

// ---- device binding -------------------------------------------------------------------------------------------------
// The ticket and the web cookie carry the device id and the device-token hash ENCRYPTED (AES-GCM, key derived from SESSIYA_KALIT) so a
// logged URL never exposes the hash. Every web request re-verifies the device with t2_desktop_qurilma_tekshir_v2, so revoking the device
// (sign out, admin kill, expiry) revokes the WebView session too.
async function aesKey(kalit: string): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('mobil-web-hash|' + kalit));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function hashSifrla(hash: string, kalit: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(kalit), new TextEncoder().encode(hash)));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
  return base64url(out);
}
export async function hashOch(blob: string, kalit: string): Promise<string | null> {
  try {
    const b = unbase64url(blob);
    if (b.length < 13 + 16) return null;
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.slice(0, 12) }, await aesKey(kalit), b.slice(12));
    const s = new TextDecoder().decode(pt);
    return /^[0-9a-f]{64}$/.test(s) ? s : null;
  } catch { return null; }
}

// ---- single use -----------------------------------------------------------------------------------------------------
// Layer 1 (always): per-isolate used-nonce set. Layer 2 (when MOBIL_BILET_BIR_MARTALIK=1 and migration 20261224200000 is applied):
// atomic DB insert, which holds across isolates. With the flag on a DB failure FAILS CLOSED.
const ishlatilgan = new Map<string, number>();
export const biletKeshTozala = () => ishlatilgan.clear();
export async function biletIshlat(p: BiletYuk, env: { SUPABASE_URL: string; SUPABASE_KEY: string; MOBIL_BILET_BIR_MARTALIK?: string }, hozir = Date.now()): Promise<boolean> {
  for (const [k, e] of ishlatilgan) if (e < hozir) ishlatilgan.delete(k);
  if (ishlatilgan.has(p.n)) return false;
  ishlatilgan.set(p.n, p.e);
  if (env.MOBIL_BILET_BIR_MARTALIK !== '1') return true;
  try {
    const r = await fetch(supabaseBaseUrl(env.SUPABASE_URL) + '/rest/v1/rpc/t2_mobil_bilet_ishlat_v1', {
      method: 'POST', headers: { apikey: env.SUPABASE_KEY, Authorization: 'Bearer ' + env.SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_jti: p.n, p_foydalanuvchi_id: p.u, p_tugaydi: new Date(p.e).toISOString() }),
    });
    if (!r.ok) return false;
    const j = await r.json() as { ok?: boolean };
    return j?.ok === true;
  } catch { return false; }
}

// ---- web cookie gate (called first by api/_middleware.ts) -----------------------------------------------------------
export type WebSess = { wd: string; wh: string; wi: number };
const tekshirKesh = new Map<string, number>();
export const webKeshTozala = () => tekshirKesh.clear();
export async function qurilmaTirikmi(env: DesktopEnv, hash: string, deviceId: string, userId: number, hozir = Date.now()): Promise<boolean> {
  const key = hash + '|' + deviceId; const c = tekshirKesh.get(key);
  if (c && c > hozir) return true;
  try {
    const r = await desktopRpc(env, 't2_desktop_qurilma_tekshir_v2', { p_token_hash: hash, p_ilova_versiya: null });
    const ok = r.ok === true && r.device_id === deviceId && r.foydalanuvchi_id === userId && typeof r.tugaydi === 'number' && r.tugaydi > hozir;
    if (ok) { tekshirKesh.set(key, hozir + 10_000); if (tekshirKesh.size > 500) tekshirKesh.clear(); } else tekshirKesh.delete(key);
    return ok;
  } catch { return false; }
}

/** null = not a web-ticket cookie (normal flow). {deny:true} = revoked/expired -> 401. {refresh} = new cookie value to set (sliding). */
export async function webGate(request: Request, env: DesktopEnv, hozir = Date.now()): Promise<null | { deny: true } | { deny: false; refresh?: string }> {
  if (request.headers.has('Authorization')) return null;
  const s = await tekshir(request.headers.get('Cookie'), env.SESSIYA_KALIT) as (Sess & Partial<WebSess>) | null;
  if (!s || typeof s.wd !== 'string') return null;
  const hash = typeof s.wh === 'string' ? await hashOch(s.wh, env.SESSIYA_KALIT) : null;
  if (!hash || !uuid(s.wd) || !positiveId(s.foydalanuvchi_id) || !Number.isSafeInteger(s.wi) || hozir - Number(s.wi) > WEB_MAX_MS) return { deny: true };
  if (!await qurilmaTirikmi(env, hash, s.wd, Number(s.foydalanuvchi_id), hozir)) return { deny: true };
  const issuedAt = s.exp - WEB_SESSIYA_MS;
  if (hozir - issuedAt < WEB_YANGILASH_MS) return { deny: false };
  return { deny: false, refresh: await webCookie({ rol: s.rol, u: Number(s.foydalanuvchi_id), d: s.wd, wh: s.wh!, wi: Number(s.wi) }, env.SESSIYA_KALIT, hozir) };
}

export async function webCookie(p: { rol: string; u: number; d: string; wh: string; wi: number }, kalit: string, hozir = Date.now()): Promise<string> {
  const v = await imzola({ rol: p.rol as Rol, foydalanuvchi_id: p.u, wd: p.d, wh: p.wh, wi: p.wi } as never, kalit, hozir - SESSIYA_MUDDAT_MS + WEB_SESSIYA_MS);
  return `sess=${v}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${WEB_SESSIYA_MS / 1000}`;
}