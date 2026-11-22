/**
 * «Telegram orqali kirish» (MCP /authorize): saytning TAYYOR oqimi (/api/kirish-telegram — bot deep-link + kontakt tasdig'i,
 * t2_tg_kirish_* RPC lari) server-dan-serverga chaqiriladi. Worker sir saqlamaydi: nonce+sir faqat KV da (10 daqiqa, login
 * sessiyasiga bog'langan), sayt bergan sessiya tokenidan faqat foydalanuvchi_id o'qiladi (TLS orqali o'z saytimizdan olingan).
 * Keyin parol/Google bilan bir xil `yakunla` — jonli vakolat (hisob faol + kompaniya a'zoligi) tekshiriladi; yangi hisob ruxsat olmaydi.
 * CSP skriptga ruxsat bermaydi — kutish sahifasi <meta refresh> bilan holatni tekshiradi.
 */
import type { Env, Props } from './env';
import { HOLAT_ID, holatCookie, holatCookieOl, html, qaytaYasa, yakunla, type Saqlangan } from './kirish';

export const TG_YO_L = '/authorize/telegram';
export const TG_HOLAT_YO_L = '/authorize/telegram/holat';
const TTL = 600;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const sayt = (env: Env) => (env.SAYT_URL || 'https://qurai.uz').trim().replace(/\/+$/, '');

type SaytJavob = { ok?: boolean; code?: string; xabar?: string; nonce?: string; sir?: string; belgi?: string; havola?: string; holat?: string };

async function saytga(env: Env, body: Record<string, unknown>, f: typeof fetch = fetch): Promise<{ j: SaytJavob | null; cookie: string | null }> {
  try {
    const s = sayt(env);
    const r = await f(`${s}/api/kirish-telegram`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: s }, body: JSON.stringify(body) });
    return { j: await r.json().catch(() => null) as SaytJavob | null, cookie: r.headers.get('Set-Cookie') };
  } catch { return { j: null, cookie: null }; }
}

/** Sayt sessiya tokeni (sess=<base64 JSON>.<imzo>) dan foydalanuvchi id va login. */
export function sessdanProps(setCookie: string | null): Props | null {
  const t = setCookie?.match(/sess=([^;]+)/)?.[1];
  const body = t?.split('.')[0];
  if (!body) return null;
  try {
    const s = JSON.parse(atob(body)) as { foydalanuvchi_id?: number; email?: string };
    const id = Number(s.foydalanuvchi_id);
    return Number.isSafeInteger(id) && id > 0 ? { foydalanuvchi_id: id, login: String(s.email ?? ''), iat: Date.now() } : null;
  } catch { return null; }
}

function kutishSahifa(o: { holat: string; havola: string; belgi: string }): string {
  const h = esc(o.holat);
  return `<!doctype html><html lang="uz"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="3;url=${TG_HOLAT_YO_L}?holat=${h}"><title>QURAI — Telegram orqali kirish</title>
<style>body{font-family:system-ui,sans-serif;background:#f5f6f8;margin:0;padding:24px;color:#1b1f24}main{max-width:380px;margin:40px auto;background:#fff;border-radius:12px;padding:24px;box-shadow:0 1px 4px #0002}
h1{font-size:20px;margin:0 0 8px}p{font-size:14px;line-height:1.45}a.t{display:block;margin-top:14px;text-align:center;padding:12px;border-radius:8px;background:#229ed9;color:#fff;text-decoration:none;font-size:16px}
.b{font-size:28px;font-weight:700;letter-spacing:6px;text-align:center;margin:12px 0}.k{font-size:12px;color:#5b6370}</style></head>
<body><main><h1>Telegram orqali kirish</h1><p>1. Pastdagi tugma bilan botni oching va <b>Start</b> ni bosing.<br>2. Botda raqamingizni ulashing (tasdiqlang).<br>3. Shu sahifa o'zi kirib ketadi.</p>
<p>Botda ko'rinadigan kod shu bilan bir xil bo'lishi kerak:</p><div class="b">${esc(o.belgi)}</div>
<a class="t" href="${esc(o.havola)}" target="_blank" rel="noopener">Telegram botni ochish</a>
<p class="k">Kutilmoqda… sahifa har 3 soniyada tekshiradi. 5 daqiqada tasdiqlanmasa — <a href="/authorize/telegram?holat=${h}">qaytadan boshlash</a>.</p></main></body></html>`;
}

async function saqlanganOl(request: Request, env: Env, id: string): Promise<Saqlangan | null> {
  if (!HOLAT_ID.test(id) || holatCookieOl(request) !== id) return null;
  const xom = await env.OAUTH_KV.get(`mcp_login:${id}`);
  return xom ? JSON.parse(xom) as Saqlangan : null;
}

const muddat = () => html('<p>Sessiya muddati o\'tdi — AI ilovada ulanishni qaytadan boshlang.</p>', 400);

/** GET /authorize/telegram?holat=<id> — bot havolasini yaratadi. */
export async function telegramBoshla(request: Request, env: Env): Promise<Response> {
  const id = new URL(request.url).searchParams.get('holat') ?? '';
  const s = await saqlanganOl(request, env, id);
  if (!s) return muddat();
  const qayta = qaytaYasa(env, s, id);
  const ip = request.headers.get('CF-Connecting-IP') ?? 'nomalum';
  if (!(await env.LOGIN_RATE.limit({ key: `tg:${ip}` })).success) return qayta('Juda ko\'p urinish. Bir daqiqadan so\'ng qayta urinib ko\'ring.', 429);
  const { j } = await saytga(env, { amal: 'boshla' });
  if (!j?.ok || !j.nonce || !j.sir || !j.havola || !j.belgi) return qayta(j?.xabar || 'Telegram orqali kirishni boshlab bo\'lmadi. Login/parol bilan kiring.', 503);
  await env.OAUTH_KV.put(`mcp_tg:${id}`, JSON.stringify({ nonce: j.nonce, sir: j.sir, havola: j.havola, belgi: j.belgi }), { expirationTtl: TTL });
  return html(kutishSahifa({ holat: id, havola: j.havola, belgi: j.belgi }), 200, holatCookie(id));
}

/** GET /authorize/telegram/holat?holat=<id> — tasdiqni tekshiradi; tayyor bo'lsa OAuth grant. */
export async function telegramHolat(request: Request, env: Env): Promise<Response> {
  const id = new URL(request.url).searchParams.get('holat') ?? '';
  const s = await saqlanganOl(request, env, id);
  if (!s) return muddat();
  const qayta = qaytaYasa(env, s, id);
  const xom = await env.OAUTH_KV.get(`mcp_tg:${id}`);
  if (!xom) return qayta('Telegram so\'rovi eskirdi. Qaytadan boshlang.', 410);
  const t = JSON.parse(xom) as { nonce: string; sir: string; havola: string; belgi: string };
  const { j, cookie } = await saytga(env, { amal: 'holat', nonce: t.nonce, sir: t.sir });
  if (j?.ok && j.holat === 'kutmoqda') return html(kutishSahifa({ holat: id, havola: t.havola, belgi: t.belgi }), 200, holatCookie(id));
  if (!j?.ok || j.holat !== 'tayyor') { await env.OAUTH_KV.delete(`mcp_tg:${id}`); return qayta(j?.xabar || 'Telegram orqali kirib bo\'lmadi.', 403); }
  const props = sessdanProps(cookie);
  await env.OAUTH_KV.delete(`mcp_tg:${id}`);
  if (!props) return qayta('Telegram tasdig\'idan hisobni aniqlab bo\'lmadi. Login/parol bilan kiring.', 502);
  return yakunla(env, s, id, props, qayta);
}
