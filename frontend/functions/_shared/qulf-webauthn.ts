/**
 * Minimal WebAuthn (passkey) tekshiruvchi -- Cloudflare Workers (WebCrypto), tashqi kutubxonasiz.
 * Nega o'zimiz: faqat `attestation:'none'` + ES256/RS256 kerak; kutubxona (x509/cbor zanjiri) Workers bundle'ini og'irlashtiradi, bu esa ~200 qator
 * va test vektorlari bilan qoplangan (qulf-webauthn.test.ts). Attestation statement e'tiborsiz (ishonch modeli: 'none') -- qurilma markasi tekshirilmaydi.
 * Qat'iy shartlar: type, challenge, origin (allowlist), rpIdHash, UP, UV (biometrik/PIN qurilmada MAJBURIY), imzo, signCount (klon himoyasi).
 */
import { base64url, unbase64url } from './desktop-device';
import { sha256 } from './qulf';
import { derDanRaw } from './qulf';

type Cbor = number | string | boolean | null | Uint8Array | Cbor[] | Map<Cbor, Cbor>;

/** CBOR (RFC 8949) kichik dekoder: faqat aniq uzunlik, chuqurlik <= 8, 64-bit'dan katta son yo'q. */
export function cborOqi(b: Uint8Array, boshi = 0, chuqurlik = 0): { v: Cbor; i: number } {
  if (chuqurlik > 8 || boshi >= b.length) throw new Error('CBOR');
  let i = boshi;
  const ib = b[i++]; const major = ib >> 5; const ai = ib & 31;
  let n: number;
  if (ai < 24) n = ai;
  else if (ai === 24) { n = b[i]; i += 1; }
  else if (ai === 25) { n = (b[i] << 8) | b[i + 1]; i += 2; }
  else if (ai === 26) { n = ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3]; i += 4; }
  else if (ai === 27) { const hi = ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3]; const lo = ((b[i + 4] << 24) >>> 0) + (b[i + 5] << 16) + (b[i + 6] << 8) + b[i + 7]; if (hi > 0x1fffff) throw new Error('CBOR'); n = hi * 2 ** 32 + lo; i += 8; }
  else if (major === 7 && (ai === 20 || ai === 21 || ai === 22)) return { v: ai === 20 ? false : ai === 21 ? true : null, i };
  else throw new Error('CBOR');
  if (!Number.isFinite(n) || i > b.length) throw new Error('CBOR');
  switch (major) {
    case 0: return { v: n, i };
    case 1: return { v: -1 - n, i };
    case 2: if (i + n > b.length) throw new Error('CBOR'); return { v: b.slice(i, i + n), i: i + n };
    case 3: if (i + n > b.length) throw new Error('CBOR'); return { v: new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(b.slice(i, i + n)), i: i + n };
    case 4: { if (n > 64) throw new Error('CBOR'); const a: Cbor[] = []; for (let k = 0; k < n; k++) { const r = cborOqi(b, i, chuqurlik + 1); a.push(r.v); i = r.i; } return { v: a, i }; }
    case 5: { if (n > 64) throw new Error('CBOR'); const m = new Map<Cbor, Cbor>(); for (let k = 0; k < n; k++) { const kk = cborOqi(b, i, chuqurlik + 1); const vv = cborOqi(b, kk.i, chuqurlik + 1); m.set(kk.v, vv.v); i = vv.i; } return { v: m, i }; }
    default: throw new Error('CBOR');
  }
}

export type ClientData = { type: string; challenge: string; origin: string; crossOrigin?: boolean };
function clientDataOqi(bytes: Uint8Array): ClientData | null {
  try { const o = JSON.parse(new TextDecoder().decode(bytes)); return o && typeof o === 'object' ? o as ClientData : null; } catch { return null; }
}
const teng = (a: string, b: string) => { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };

export type Kutilgan = { challenge: string; origins: readonly string[]; rpId: string };
type Xato = { ok: false; code: string };

async function umumiy(cdBytes: Uint8Array, authData: Uint8Array, tur: 'webauthn.create' | 'webauthn.get', k: Kutilgan): Promise<Xato | { ok: true; flags: number; hisob: number }> {
  const cd = clientDataOqi(cdBytes);
  if (!cd || cd.type !== tur) return { ok: false, code: 'CLIENT_DATA' };
  if (typeof cd.challenge !== 'string' || !teng(cd.challenge, k.challenge)) return { ok: false, code: 'CHALLENGE' };
  if (typeof cd.origin !== 'string' || !k.origins.includes(cd.origin) || cd.crossOrigin === true) return { ok: false, code: 'ORIGIN' };
  if (authData.length < 37) return { ok: false, code: 'AUTH_DATA' };
  const rpHash = authData.slice(0, 32);
  if (!teng(base64url(rpHash), base64url(await sha256(k.rpId)))) return { ok: false, code: 'RP_ID' };
  const flags = authData[32];
  if (!(flags & 0x01)) return { ok: false, code: 'UP' };
  if (!(flags & 0x04)) return { ok: false, code: 'UV' };
  const hisob = ((authData[33] << 24) >>> 0) + (authData[34] << 16) + (authData[35] << 8) + authData[36];
  return { ok: true, flags, hisob };
}

export type RegNatija = { ok: true; kredensial_id: string; ochiq_kalit: string; alg: -7 | -257; hisob: number } | Xato;

/** attestationObject (CBOR) -> authData -> COSE kalit -> SPKI. `kredensial_id` = authenticator bergan id (base64url). */
export async function regTekshir(inp: { clientDataJSON: string; attestationObject: string }, k: Kutilgan): Promise<RegNatija> {
  try {
    const cdb = unbase64url(inp.clientDataJSON);
    const ao = cborOqi(unbase64url(inp.attestationObject)).v;
    if (!(ao instanceof Map)) return { ok: false, code: 'ATTESTATION' };
    const authData = ao.get('authData');
    if (!(authData instanceof Uint8Array)) return { ok: false, code: 'ATTESTATION' };
    const u = await umumiy(cdb, authData, 'webauthn.create', k);
    if (!u.ok) return u;
    if (!(u.flags & 0x40) || authData.length < 55) return { ok: false, code: 'AT_YOQ' };
    const idLen = (authData[53] << 8) | authData[54];
    if (idLen < 1 || idLen > 1023 || 55 + idLen >= authData.length) return { ok: false, code: 'KREDENSIAL' };
    const kredId = authData.slice(55, 55 + idLen);
    const cose = cborOqi(authData, 55 + idLen).v;
    if (!(cose instanceof Map)) return { ok: false, code: 'COSE' };
    const kty = cose.get(1); const alg = cose.get(3);
    let spki: ArrayBuffer;
    if (kty === 2 && alg === -7) {
      const crv = cose.get(-1); const x = cose.get(-2); const y = cose.get(-3);
      if (crv !== 1 || !(x instanceof Uint8Array) || !(y instanceof Uint8Array) || x.length !== 32 || y.length !== 32) return { ok: false, code: 'COSE' };
      const raw = new Uint8Array(65); raw[0] = 4; raw.set(x, 1); raw.set(y, 33);
      const key = await crypto.subtle.importKey('raw', raw, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']);
      spki = await crypto.subtle.exportKey('spki', key) as ArrayBuffer;
    } else if (kty === 3 && alg === -257) {
      const n = cose.get(-1); const e = cose.get(-2);
      if (!(n instanceof Uint8Array) || !(e instanceof Uint8Array) || n.length < 256 || n.length > 512 || e.length > 4) return { ok: false, code: 'COSE' };
      const key = await crypto.subtle.importKey('jwk', { kty: 'RSA', n: base64url(n), e: base64url(e), alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, true, ['verify']);
      spki = await crypto.subtle.exportKey('spki', key) as ArrayBuffer;
    } else return { ok: false, code: 'ALG' };
    return { ok: true, kredensial_id: base64url(kredId), ochiq_kalit: base64url(new Uint8Array(spki)), alg: alg as -7 | -257, hisob: u.hisob };
  } catch { return { ok: false, code: 'REG_BUZUQ' }; }
}

export type KirishNatija = { ok: true; hisob: number } | Xato;

/** Assertion: imzo = sign(authData || SHA-256(clientDataJSON)). saqlangan hisob bilan solishtirish (ikkalasi 0 bo'lsa -- hisoblagichsiz qurilma, ruxsat). */
export async function kirishTekshir(inp: { clientDataJSON: string; authenticatorData: string; signature: string },
  kalit: { ochiq_kalit: string; alg: number; hisob: number }, k: Kutilgan): Promise<KirishNatija> {
  try {
    const cdb = unbase64url(inp.clientDataJSON); const ad = unbase64url(inp.authenticatorData); const sig = unbase64url(inp.signature);
    const u = await umumiy(cdb, ad, 'webauthn.get', k);
    if (!u.ok) return u;
    const data = new Uint8Array(ad.length + 32); data.set(ad); data.set(await sha256(cdb), ad.length);
    const spki = unbase64url(kalit.ochiq_kalit);
    let ok = false;
    if (kalit.alg === -7) {
      const key = await crypto.subtle.importKey('spki', spki, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
      const raw = derDanRaw(sig);
      ok = !!raw && await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, raw as BufferSource, data);
    } else if (kalit.alg === -257) {
      const key = await crypto.subtle.importKey('spki', spki, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
      ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, data);
    }
    if (!ok) return { ok: false, code: 'IMZO' };
    if ((u.hisob !== 0 || kalit.hisob !== 0) && u.hisob <= kalit.hisob) return { ok: false, code: 'KLON' };
    return { ok: true, hisob: u.hisob };
  } catch { return { ok: false, code: 'KIRISH_BUZUQ' }; }
}

/** rpId: QULF_RP_ID (env) yoki so'rov host'i. Origin'lar: so'rov origin'i + QULF_ORIGINS (vergul bilan). */
export function rpVaOrigin(requestUrl: string, env: { QULF_RP_ID?: string; QULF_ORIGINS?: string }): { rpId: string; origins: string[] } {
  const u = new URL(requestUrl);
  const extra = String(env.QULF_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  return { rpId: (env.QULF_RP_ID || u.hostname).trim(), origins: [u.origin, ...extra] };
}
