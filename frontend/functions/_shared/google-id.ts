/**
 * Google ID token tekshiruvi — /api/kirish-google (kirish) va /api/profil (hisobga ulash) UCHUN YAGONA kod.
 * Imzo (Google JWKS), aud = GOOGLE_CLIENT_ID, iss = accounts.google.com, exp, email_verified.
 */
export type Jwk = JsonWebKey & { kid?: string };

/* Client ID MAXFIY EMAS (har bir foydalanuvchi brauzerida ko'rinadi) — env bilan almashtirish mumkin.
 * Google Cloud: loyiha studious-matrix-427110-k9, client "Smeta tizimi" (Cloudflare GOOGLE_CLIENT_ID ham shu),
 * origin https://smeta-tizimi.pages.dev. */
export const STANDART_CLIENT_ID = '117465515912-avm12uflc7m9p7m5ioid8v998j42p2ok.apps.googleusercontent.com';

const b64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
const jsonB64u = (s: string) => JSON.parse(new TextDecoder().decode(b64u(s)));

let jwksKesh: { vaqt: number; kalitlar: Jwk[] } | null = null;
export async function googleKalitlar(): Promise<Jwk[]> {
  if (jwksKesh && Date.now() - jwksKesh.vaqt < 3600_000) return jwksKesh.kalitlar;
  const r = await fetch('https://www.googleapis.com/oauth2/v3/certs');
  if (!r.ok) throw new Error('JWKS_' + r.status);
  const j = await r.json() as { keys: Jwk[] };
  jwksKesh = { vaqt: Date.now(), kalitlar: j.keys };
  return j.keys;
}

export type GoogleProfil = { email: string; ism: string; sub: string };

/** ID tokenni to'liq tekshiradi; xato bo'lsa sababi bilan null. */
export async function googleTokenTekshir(token: string, clientId: string, kalitlar: Jwk[], hozir = Date.now()): Promise<{ ok: true; p: GoogleProfil } | { ok: false; sabab: string }> {
  const q = token.split('.');
  if (q.length !== 3) return { ok: false, sabab: 'FORMAT' };
  let h: { alg?: string; kid?: string }; let p: Record<string, unknown>;
  try { h = jsonB64u(q[0]); p = jsonB64u(q[1]); } catch { return { ok: false, sabab: 'FORMAT' }; }
  if (h.alg !== 'RS256') return { ok: false, sabab: 'ALG' };
  const jwk = kalitlar.find((k) => k.kid === h.kid);
  if (!jwk) return { ok: false, sabab: 'KID' };
  const kalit = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const togri = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', kalit, b64u(q[2]), new TextEncoder().encode(q[0] + '.' + q[1]));
  if (!togri) return { ok: false, sabab: 'IMZO' };
  if (p.aud !== clientId) return { ok: false, sabab: 'AUD' };
  if (p.iss !== 'accounts.google.com' && p.iss !== 'https://accounts.google.com') return { ok: false, sabab: 'ISS' };
  if (typeof p.exp !== 'number' || p.exp * 1000 < hozir) return { ok: false, sabab: 'EXP' };
  if (p.email_verified !== true || typeof p.email !== 'string' || typeof p.sub !== 'string') return { ok: false, sabab: 'EMAIL_TASDIQLANMAGAN' };
  return { ok: true, p: { email: p.email.toLowerCase(), ism: typeof p.name === 'string' ? p.name : '', sub: p.sub } };
}

/* Egasi (2026-10-02): "Error 400: origin_mismatch — production'da chiqsa oqibati jiddiy". Google faqat OAuth
 * mijozida ro'yxatdan o'tgan JavaScript origin'larda ishlaydi va wildcard qabul qilmaydi — Cloudflare har deploy uchun
 * beradigan preview manzillar (xxxx.smeta-tizimi.pages.dev) HECH QACHON ishlamaydi. Shuning uchun ruxsat etilgan
 * origin'lar ro'yxati sahifaga beriladi: boshqa manzilda Google tugmasi chizilmaydi, foydalanuvchi asosiy manzilga
 * yo'naltiriladi. Ro'yxat Google Cloud Console dagi "Authorized JavaScript origins" bilan AYNAN bir xil bo'lishi kerak
 * (env GOOGLE_ORIGINS, vergul bilan; sukut — asosiy prod manzil). */
const STANDART_ORIGINLAR = ['https://smeta-tizimi.pages.dev'];
export function googleOriginlar(env: { GOOGLE_ORIGINS?: string }): string[] {
  const r = String(env.GOOGLE_ORIGINS || '').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter((s) => /^https?:\/\/[^/\s]+$/.test(s));
  return r.length ? r : STANDART_ORIGINLAR;
}

