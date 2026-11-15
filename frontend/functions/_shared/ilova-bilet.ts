/**
 * Ilova (Android WebView) uchun brauzer orqali kirish bileti.
 * Google/Telegram/parol kirishi tizim brauzerida (Chrome) bo'ladi; ilovaga bir martalik, qisqa muddatli, shifrlangan BILET
 * qaytadi (qurai://kirish?t=...). Bilet ichida sessiya tokeni va ilovaning SIRI xeshi (h = sha256(sir)) bor:
 * bilet o'g'irlansa ham sirsiz ochilmaydi. Saqlash (DB) kerak emas: AES-GCM, kalit = SHA-256(SESSIYA_KALIT + domen).
 */
export const BILET_MUDDAT_MS = 120_000;
const enc = new TextEncoder();
const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
export const XESH_RE = /^[A-Za-z0-9_-]{43}$/;
export const SIR_RE = /^[A-Za-z0-9_-]{32,128}$/;

async function kalit(secret: string): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest('SHA-256', enc.encode('ilova-bilet-v1|' + secret));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function siryXesh(sir: string): Promise<string> {
  return b64u(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(sir))));
}

export async function biletYarat(token: string, h: string, secret: string, hozir = Date.now()): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await kalit(secret), enc.encode(JSON.stringify({ s: token, h, e: hozir + BILET_MUDDAT_MS }))));
  const out = new Uint8Array(iv.length + ct.length); out.set(iv); out.set(ct, iv.length);
  return b64u(out);
}

export async function biletOch(bilet: string, sir: string, secret: string, hozir = Date.now()): Promise<string | null> {
  try {
    if (!SIR_RE.test(sir) || bilet.length > 4000) return null;
    const raw = unb64u(bilet);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, await kalit(secret), raw.slice(12));
    const p = JSON.parse(new TextDecoder().decode(pt)) as { s?: string; h?: string; e?: number };
    if (!p.s || !p.h || !p.e || hozir > p.e) return null;
    if (p.h !== (await siryXesh(sir))) return null;
    return p.s;
  } catch { return null; }
}
