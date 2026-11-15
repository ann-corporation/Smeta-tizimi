/**
 * mobil-bilet.ts — bir martalik (30 s) VEB-KIRISH BILETI: native ilova WebView'ida saytning hali native bo'lmagan sahifasini ochish.
 * Bilet: base64url(JSON{u,r,y,e,n}).HMAC-SHA256 (SESSIYA_KALIT, «mobil-web-bilet|» domen ajratgich). Faqat tasdiqlangan qurilma Bearer'i
 * bilan beriladi (api/mobil/web-bilet); `api/mobil/web-kirish` uni qisqa umrli (8 soat) `sess` cookie'ga almashtiradi va FAQAT
 * bilet ichidagi /admin yo'liga yo'naltiradi. Bilet ichida rol/ruxsat qarori YO'Q: har so'rovda baribir bazadan yangi vakolat olinadi.
 */
import { base64url, unbase64url } from './desktop-device';

export const BILET_MS = 30_000;
export const WEB_SESSIYA_MS = 8 * 3600_000;
export const BILET_YOL = /^\/admin(?:\/[A-Za-z0-9_.~-]+)*(?:\?[A-Za-z0-9_=&.%-]*)?$/;
export const biletYolYaroqli = (y: unknown): y is string => typeof y === 'string' && y.length <= 200 && !y.includes('..') && BILET_YOL.test(y);

export type BiletYuk = { u: number; r: string; y: string; e: number; n: string };

async function hmac(body: string, kalit: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(kalit), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64url(new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode('mobil-web-bilet|' + body))));
}
const teng = (a: string, b: string) => { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };

export async function biletYarat(yuk: { u: number; r: string; y: string }, kalit: string, hozir = Date.now()): Promise<string> {
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
    if (!Number.isSafeInteger(p.u) || p.u <= 0 || typeof p.r !== 'string' || !biletYolYaroqli(p.y) || !Number.isSafeInteger(p.e) || hozir > p.e) return null;
    return p;
  } catch { return null; }
}
