/**
 * OAuth /authorize sahifasi: foydalanuvchi Smeta tizimi login/paroli bilan kiradi. Parol web ilova bilan AYNAN bir xil
 * tekshiriladi (`t2_parol_tekshir_v1`, service kaliti faqat Worker sirida); hisob holati va kompaniyalar — `t2_men_v1`
 * (roleAuthority). Parol hech qayerga yozilmaydi/loglanmaydi. GAS-faqat (Supabase xeshi hali yo'q) hisoblar — avval saytga bir
 * marta kirish kerak (sayt parolni Supabase'ga ko'chiradi).
 */
import { supabaseBaseUrl } from '../../../frontend/functions/_shared/supabase-url';
import type { AuthRequest, Env, Props } from './env';
import { vakolatOl } from './vakolat';

const HOLAT_TTL = 600;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const kut = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function sahifa(o: { klient: string; redirectHost: string; holat: string; xato?: string; login?: string }): string {
  return `<!doctype html><html lang="uz"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Smeta tizimi — AI ulanish</title><style>body{font-family:system-ui,sans-serif;background:#f5f6f8;margin:0;padding:24px;color:#1b1f24}
main{max-width:380px;margin:40px auto;background:#fff;border-radius:12px;padding:24px;box-shadow:0 1px 4px #0002}h1{font-size:20px;margin:0 0 8px}
p{font-size:14px;line-height:1.45}label{display:block;font-size:13px;margin:12px 0 4px}input{width:100%;box-sizing:border-box;padding:10px;border:1px solid #c8ccd2;border-radius:8px;font-size:15px}
button{margin-top:16px;width:100%;padding:11px;border:0;border-radius:8px;background:#1d4ed8;color:#fff;font-size:15px;cursor:pointer}.x{color:#b42318;font-size:14px}.k{font-size:12px;color:#5b6370}</style></head>
<body><main><h1>Smeta tizimi</h1><p><b>${esc(o.klient)}</b> (${esc(o.redirectHost)}) sizning nomingizdan Smeta tizimi ma'lumotlarini o'qish va
(sizning tasdig'ingiz bilan) yozish uchun ruxsat so'ramoqda. Faqat siz a'zo bo'lgan kompaniyalar ko'rinadi.</p>
${o.xato ? `<p class="x">${esc(o.xato)}</p>` : ''}
<form method="post" action="/authorize"><input type="hidden" name="holat" value="${esc(o.holat)}">
<label for="l">Login</label><input id="l" name="login" autocomplete="username" required value="${esc(o.login ?? '')}">
<label for="p">Parol</label><input id="p" name="parol" type="password" autocomplete="current-password" required>
<button type="submit">Kirish va ruxsat berish</button></form>
<p class="k">Ruxsatni bekor qilish: saytda parolni almashtiring yoki «boshqa qurilmalardan chiqish» — barcha AI ulanishlari ham to'xtaydi.</p></main></body></html>`;
}

/** CSP form-action yo'naltirishlarga ham amal qiladi (Chrome): login POST → 302 → AI ilova callback'i bloklanmasin. */
export const formManba = (redirectUri: string): string | undefined => { try { const u = new URL(redirectUri); return u.protocol === 'https:' || u.hostname === 'localhost' ? u.origin : undefined; } catch { return undefined; } };
const html = (s: string, status = 200, cookie?: string, redirectOrigin?: string) => new Response(s, {
  status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': `default-src 'none'; style-src 'unsafe-inline'; form-action 'self'${redirectOrigin ? ' ' + redirectOrigin : ''}; frame-ancestors 'none'`, ...(cookie ? { 'Set-Cookie': cookie } : {}) },
});
const holatCookie = (id: string) => `mcp_holat=${id}; HttpOnly; Secure; SameSite=Lax; Path=/authorize; Max-Age=${HOLAT_TTL}`;

type Saqlangan = { soriq: AuthRequest; klient: string; redirectHost: string };

export async function authorizeGet(request: Request, env: Env): Promise<Response> {
  let soriq: AuthRequest;
  try { soriq = await env.OAUTH_PROVIDER.parseAuthRequest(request); } catch { return html('<p>Noto\'g\'ri avtorizatsiya so\'rovi.</p>', 400); }
  const klient = await env.OAUTH_PROVIDER.lookupClient(soriq.clientId);
  if (!klient) return html('<p>Noma\'lum ilova (client_id).</p>', 400);
  const id = crypto.randomUUID();
  const s: Saqlangan = { soriq, klient: klient.clientName || 'AI ilova', redirectHost: new URL(soriq.redirectUri).host };
  await env.OAUTH_KV.put(`mcp_login:${id}`, JSON.stringify(s), { expirationTtl: HOLAT_TTL });
  return html(sahifa({ klient: s.klient, redirectHost: s.redirectHost, holat: id }), 200, holatCookie(id), formManba(soriq.redirectUri));
}

type ParolJavob = { ok?: boolean; code?: string; foydalanuvchi_id?: number; login?: string };

export async function parolTekshir(env: Env, login: string, parol: string, f: typeof fetch = fetch): Promise<ParolJavob | null> {
  try {
    const r = await f(supabaseBaseUrl(env.SUPABASE_URL) + '/rest/v1/rpc/t2_parol_tekshir_v1', {
      method: 'POST', headers: { apikey: env.SUPABASE_KEY, Authorization: 'Bearer ' + env.SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_login: login, p_parol: parol }),
    });
    return r.ok ? await r.json() as ParolJavob : null;
  } catch { return null; }
}

export async function authorizePost(request: Request, env: Env): Promise<Response> {
  const f = await request.formData().catch(() => null);
  const id = String(f?.get('holat') ?? '');
  const login = String(f?.get('login') ?? '').trim().slice(0, 200);
  const parol = String(f?.get('parol') ?? '');
  const cookie = request.headers.get('Cookie')?.match(/(?:^|;\s*)mcp_holat=([^;]+)/)?.[1];
  if (!/^[0-9a-f-]{36}$/.test(id) || cookie !== id) return html('<p>Sessiya muddati o\'tdi — AI ilovada ulanishni qaytadan boshlang.</p>', 400);
  const xom = await env.OAUTH_KV.get(`mcp_login:${id}`);
  if (!xom) return html('<p>Sessiya muddati o\'tdi — AI ilovada ulanishni qaytadan boshlang.</p>', 400);
  const s = JSON.parse(xom) as Saqlangan;
  const qayta = (xato: string, status = 401) => html(sahifa({ klient: s.klient, redirectHost: s.redirectHost, holat: id, xato, login }), status, holatCookie(id), formManba(s.soriq.redirectUri));
  const ip = request.headers.get('CF-Connecting-IP') ?? 'nomalum';
  const rl = await env.LOGIN_RATE.limit({ key: `ip:${ip}` });
  const rl2 = await env.LOGIN_RATE.limit({ key: `login:${login.toLowerCase()}` });
  if (!rl.success || !rl2.success) return qayta('Juda ko\'p urinish. Bir daqiqadan so\'ng qayta urinib ko\'ring.', 429);
  if (!login || !parol) return qayta('Login va parolni kiriting.', 400);
  const j = await parolTekshir(env, login, parol);
  if (!j) return qayta('Server bilan aloqa yo\'q. Qayta urinib ko\'ring.', 503);
  if (j.code === 'NO_PASSWORD_SET') { await kut(800); return qayta('Bu hisob uchun tizim paroli hali o\'rnatilmagan. Avval saytga login/parol bilan bir marta kiring (yoki profilda parol o\'rnating), keyin qayta urinib ko\'ring.'); }
  if (!j.ok || !j.foydalanuvchi_id) { await kut(800); return qayta('Login yoki parol noto\'g\'ri.'); }
  const props: Props = { foydalanuvchi_id: Number(j.foydalanuvchi_id), login: j.login || login, iat: Date.now() };
  const v = await vakolatOl(props, env);
  if (!v) return qayta('Hisob faol emas yoki vakolatni tekshirib bo\'lmadi.', 403);
  if (!v.kompaniyalar.length) return qayta('Siz hech bir kompaniyaga a\'zo emassiz — AI ulanishga ruxsat yo\'q.', 403);
  await env.OAUTH_KV.delete(`mcp_login:${id}`);
  const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
    request: s.soriq, userId: String(props.foydalanuvchi_id), metadata: { login: props.login, klient: s.klient }, scope: s.soriq.scope, props,
  });
  return new Response(null, { status: 302, headers: { Location: redirectTo, 'Set-Cookie': 'mcp_holat=; HttpOnly; Secure; SameSite=Lax; Path=/authorize; Max-Age=0', 'Cache-Control': 'no-store' } });
}
