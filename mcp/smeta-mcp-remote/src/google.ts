/**
 * «Google bilan kirish» — OAuth 2.0 authorization code + PKCE (S256) + state + nonce; id_token imzosi Google JWKS bilan,
 * aud / iss / exp / email_verified — web ilova bilan BIR XIL kod (`frontend/functions/_shared/google-id.ts`).
 *
 * Qonun: Google muvaffaqiyati OZI ruxsat bermaydi. Faqat MAVJUD tizim foydalanuvchisiga ulanadi (`t2_google_mcp_kirish_v1` —
 * faqat qidiradi, hech qachon foydalanuvchi/kompaniya yaratmaydi), so'ng odatdagi jonli vakolat (`yakunla`: hisob faol +
 * kompaniya a'zoligi) tekshiriladi. Ulanmagan email — rad.
 *
 *   GET /authorize/google?holat=<id>      → Google'ga yo'naltirish (holat cookie + KV holati bilan bog'langan)
 *   GET /authorize/google/callback        → code → token → id_token tekshiruvi → mavjud foydalanuvchi → grant
 * Google Cloud'dagi «Authorized redirect URI»: `<MCP_PUBLIC_URL origin>/authorize/google/callback`.
 */
import { googleKalitlar, googleTokenTekshir, type Jwk } from '../../../frontend/functions/_shared/google-id';
import { supabaseBaseUrl } from '../../../frontend/functions/_shared/supabase-url';
import type { Env, Props } from './env';
import { googleSozlangan, HOLAT_ID, HOLAT_TTL_S, holatCookieOl, html, qaytaYasa, yakunla, type Saqlangan } from './kirish';
import { resursUrl } from './url';

export const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
export const GOOGLE_YO_L = '/authorize/google';
export const GOOGLE_QAYTISH_YO_L = '/authorize/google/callback';

export const googleRedirectUri = (env: { MCP_PUBLIC_URL?: string }): string => `${new URL(resursUrl(env)).origin}${GOOGLE_QAYTISH_YO_L}`;

const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const tasodifiy = (n: number) => b64u(crypto.getRandomValues(new Uint8Array(n)));
export const pkceChallenge = async (verifier: string) => b64u(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
const xatoSahifa = (matn: string, status = 400) => html(`<p>${matn}</p>`, status);

type GoogleHolat = { holat: string; nonce: string; verifier: string };

/** id_token tekshirilgandan KEYIN payload'dan nonce o'qiladi (imzo `googleTokenTekshir` da allaqachon tasdiqlangan). */
export function tokenNonce(token: string): string | null {
  try {
    const q = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const p = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(q.padEnd(Math.ceil(q.length / 4) * 4, '=')), (c) => c.charCodeAt(0)))) as { nonce?: unknown };
    return typeof p.nonce === 'string' ? p.nonce : null;
  } catch { return null; }
}

export type GoogleMavjud = { ok?: boolean; code?: string; foydalanuvchi_id?: number; login?: string };

/** Faqat qidiruv RPC (yaratmaydi): google_sub yoki admin kiritgan email bo'yicha MAVJUD faol foydalanuvchi. */
export async function googleMavjud(env: Env, email: string, sub: string, f: typeof fetch = fetch): Promise<GoogleMavjud | null> {
  try {
    const r = await f(supabaseBaseUrl(env.SUPABASE_URL) + '/rest/v1/rpc/t2_google_mcp_kirish_v1', {
      method: 'POST', headers: { apikey: env.SUPABASE_KEY, Authorization: 'Bearer ' + env.SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_email: email, p_sub: sub }),
    });
    return r.ok ? await r.json() as GoogleMavjud : null;
  } catch { return null; }
}

async function tezlik(request: Request, env: Env): Promise<boolean> {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'nomalum';
  return (await env.LOGIN_RATE.limit({ key: `ip:${ip}` })).success;
}

export async function googleBoshlash(request: Request, env: Env): Promise<Response> {
  if (!googleSozlangan(env)) return xatoSahifa('Google bilan kirish sozlanmagan.', 404);
  const id = new URL(request.url).searchParams.get('holat') ?? '';
  if (!HOLAT_ID.test(id) || holatCookieOl(request) !== id) return xatoSahifa('Sessiya muddati o\'tdi — AI ilovada ulanishni qaytadan boshlang.');
  if (!(await env.OAUTH_KV.get(`mcp_login:${id}`))) return xatoSahifa('Sessiya muddati o\'tdi — AI ilovada ulanishni qaytadan boshlang.');
  if (!(await tezlik(request, env))) return xatoSahifa('Juda ko\'p urinish. Bir daqiqadan so\'ng qayta urinib ko\'ring.', 429);
  const state = tasodifiy(32), nonce = tasodifiy(32), verifier = tasodifiy(48);
  const rec: GoogleHolat = { holat: id, nonce, verifier };
  await env.OAUTH_KV.put(`mcp_google:${state}`, JSON.stringify(rec), { expirationTtl: HOLAT_TTL_S });
  const u = new URL(GOOGLE_AUTH);
  u.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID!.trim(), redirect_uri: googleRedirectUri(env), response_type: 'code', scope: 'openid email profile',
    state, nonce, code_challenge: await pkceChallenge(verifier), code_challenge_method: 'S256', prompt: 'select_account',
  }).toString();
  return new Response(null, { status: 302, headers: { Location: u.toString(), 'Cache-Control': 'no-store' } });
}

export async function googleQaytish(request: Request, env: Env, f: typeof fetch = fetch, kalitlar: () => Promise<Jwk[]> = googleKalitlar): Promise<Response> {
  if (!googleSozlangan(env)) return xatoSahifa('Google bilan kirish sozlanmagan.', 404);
  const q = new URL(request.url).searchParams;
  const state = q.get('state') ?? '';
  if (!/^[A-Za-z0-9_-]{43}$/.test(state)) return xatoSahifa('Noto\'g\'ri so\'rov.');
  if (!(await tezlik(request, env))) return xatoSahifa('Juda ko\'p urinish. Bir daqiqadan so\'ng qayta urinib ko\'ring.', 429);
  const xom = await env.OAUTH_KV.get(`mcp_google:${state}`);
  await env.OAUTH_KV.delete(`mcp_google:${state}`); // bir martalik: takror ishlatib bo'lmaydi
  if (!xom) return xatoSahifa('Sessiya muddati o\'tdi — AI ilovada ulanishni qaytadan boshlang.');
  const rec = JSON.parse(xom) as GoogleHolat;
  // Brauzer shu login sessiyasini boshlagan brauzer bo'lishi shart (cookie ↔ KV holati).
  if (holatCookieOl(request) !== rec.holat) return xatoSahifa('Sessiya muddati o\'tdi — AI ilovada ulanishni qaytadan boshlang.');
  const sx = await env.OAUTH_KV.get(`mcp_login:${rec.holat}`);
  if (!sx) return xatoSahifa('Sessiya muddati o\'tdi — AI ilovada ulanishni qaytadan boshlang.');
  const s = JSON.parse(sx) as Saqlangan;
  const qayta = qaytaYasa(env, s, rec.holat);

  if (q.get('error')) return qayta('Google orqali kirish bekor qilindi.');
  const code = q.get('code') ?? '';
  if (!code || code.length > 2048) return qayta('Google javobi to\'liq emas. Qayta urinib ko\'ring.', 400);

  let idToken = '';
  try {
    const r = await f(GOOGLE_TOKEN, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID!.trim(), client_secret: env.GOOGLE_CLIENT_SECRET!.trim(), redirect_uri: googleRedirectUri(env), grant_type: 'authorization_code', code_verifier: rec.verifier }).toString(),
    });
    if (!r.ok) return qayta('Google tasdiqlamadi. Qayta urinib ko\'ring.', 401);
    idToken = String((await r.json() as { id_token?: unknown }).id_token ?? '');
  } catch { return qayta('Google bilan bog\'lanib bo\'lmadi. Qayta urinib ko\'ring.', 502); }
  if (!idToken || idToken.length > 8192) return qayta('Google tasdig\'i yaroqsiz.', 401);

  let t: Awaited<ReturnType<typeof googleTokenTekshir>>;
  try { t = await googleTokenTekshir(idToken, env.GOOGLE_CLIENT_ID!.trim(), await kalitlar()); }
  catch { return qayta('Google bilan bog\'lanib bo\'lmadi. Qayta urinib ko\'ring.', 502); }
  if (!t.ok || tokenNonce(idToken) !== rec.nonce) return qayta('Google tasdig\'i yaroqsiz.', 401);

  const g = await googleMavjud(env, t.p.email, t.p.sub, f);
  if (!g) return qayta('Server bilan aloqa yo\'q. Qayta urinib ko\'ring.', 503);
  if (!g.ok || !g.foydalanuvchi_id) {
    const xabar = g.code === 'GOOGLE_ULANMAGAN'
      ? 'Bu Google hisobi tizimdagi hech bir foydalanuvchiga ulanmagan. Administratordan emailingizni hisobingizga ulashni so\'rang yoki login/parol bilan kiring.'
      : g.code === 'GOOGLE_BOSHQA_HISOB' ? 'Bu hisob boshqa Google hisobiga ulangan.'
      : g.code === 'FOYDALANUVCHI_FAOL_EMAS' ? 'Hisob faol emas.'
      : 'Google bilan kirib bo\'lmadi. Login/parol bilan kiring.';
    return qayta(xabar, 403);
  }
  const props: Props = { foydalanuvchi_id: Number(g.foydalanuvchi_id), login: g.login || String(g.foydalanuvchi_id), iat: Date.now() };
  return yakunla(env, s, rec.holat, props, qayta);
}
