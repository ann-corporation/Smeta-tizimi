import { supabaseBaseUrl } from '../_shared/supabase-url';

type Env = { SUPABASE_URL: string; SUPABASE_KEY: string; SESSIYA_KALIT: string; RESEND_API_KEY: string; EMAIL_FROM: string };
const EMAIL = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;
const rpc = (env: Env, nom: string, body: unknown) => fetch(supabaseBaseUrl(env.SUPABASE_URL) + '/rest/v1/rpc/' + nom, { method: 'POST', headers: { apikey: env.SUPABASE_KEY, Authorization: 'Bearer ' + env.SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
function yangiKod(): string {
  const diapazon = 900_000;
  const chegara = Math.floor(0x1_0000_0000 / diapazon) * diapazon;
  const qiymat = new Uint32Array(1);
  do { crypto.getRandomValues(qiymat); } while (qiymat[0] >= chegara);
  return String(100_000 + (qiymat[0] % diapazon));
}
const xesh = async (s: string, kalit: string) => {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(kalit), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const out = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(s));
  return [...new Uint8Array(out)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  let body: { email?: string } = {}; try { body = await ctx.request.json(); } catch { return Response.json({ ok: false, xabar: 'Noto‘g‘ri so‘rov formati' }, { status: 400 }); }
  const email = String(body.email || '').trim().toLowerCase();
  if (!EMAIL.test(email)) return Response.json({ ok: false, xabar: 'Email manzilini to‘g‘ri kiriting.' }, { status: 400 });
  if (!ctx.env.SUPABASE_URL || !ctx.env.SUPABASE_KEY || !ctx.env.SESSIYA_KALIT || !ctx.env.RESEND_API_KEY || !ctx.env.EMAIL_FROM) return Response.json({ ok: false, code: 'EMAIL_XIZMATI_SOZLANMAGAN', xabar: 'Email tasdiqlash xizmati hali sozlanmagan.' }, { status: 503 });
  const kod = yangiKod();
  const ip = ctx.request.headers.get('CF-Connecting-IP') || '';
  const ipBelgi = ip ? (await xesh(ip + '|t2-email-ip', ctx.env.SESSIYA_KALIT)).slice(0, 16) : null;
  try {
    const start = await rpc(ctx.env, 't2_royxat_email_kod_yarat_v1', { p_email: email, p_kod_xesh: await xesh(kod + '|' + email, ctx.env.SESSIYA_KALIT), p_ip_belgi: ipBelgi });
    const d = await start.json().catch(() => null) as { ok?: boolean; code?: string; xabar?: string; tasdiqlash_id?: string } | null;
    if (!start.ok || !d?.ok || !d.tasdiqlash_id) return Response.json({ ok: false, code: d?.code, xabar: d?.xabar || 'Kod yuborib bo‘lmadi.' }, { status: 400 });
    const mail = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + ctx.env.RESEND_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: ctx.env.EMAIL_FROM, to: [email], subject: 'Smeta OS — tasdiqlash kodi', text: `Smeta OS ro‘yxatdan o‘tish kodi: ${kod}\nKod 10 daqiqa amal qiladi. Uni hech kimga bermang.` }) });
    if (!mail.ok) return Response.json({ ok: false, code: 'EMAIL_YUBORILMADI', xabar: 'Kod yuborib bo‘lmadi. Keyinroq urinib ko‘ring.' }, { status: 502 });
    const sent = await rpc(ctx.env, 't2_royxat_email_kod_yuborildi_v1', { p_tasdiqlash_id: d.tasdiqlash_id });
    if (!sent.ok) return Response.json({ ok: false, xabar: 'Kod yuborildi, lekin tasdiqlash holati saqlanmadi. Yangisini so‘rang.' }, { status: 502 });
    return Response.json({ ok: true, tasdiqlash_id: d.tasdiqlash_id });
  } catch { return Response.json({ ok: false, xabar: 'Tarmoq xatosi' }, { status: 502 }); }
};
