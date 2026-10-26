/**
 * kirish-email.ts — EMAIL KOD BILAN KIRISH VA RO'YXAT (egasi 2026-10-26: «pochtaga raqam keladi, keyin login bo'ladi»).
 *
 * POST { amal:'kod', email }                         → 6 xonali kod emailga (Resend); { ok, tasdiqlash_id }
 * POST { amal:'tasdiqla', tasdiqlash_id, email, kod, ism?, operation_id }
 *      → mavjud hisob bo'lsa kirish, bo'lmasa yangi hisob (o'z kompaniyasi + bepul tarif); /api/kirish bilan bir xil
 *        imzolangan sessiya cookie. Javob: { ok, yangi, rol, demo }.
 *
 * Xavfsizlik: kodning o'zi bazaga yozilmaydi (HMAC xesh, SESSIYA_KALIT bilan); 10 daqiqa, 5 urinish, email/IP limitlari
 * bazada (t2_email_kod_yarat_v1). Hisob bor-yo'qligi kod bosqichida oshkor qilinmaydi. Origin tekshiruvi.
 */
import { imzola, SESSIYA_MUDDAT_MS, type Rol } from '../_shared/auth';
import { supabaseBaseUrl } from '../_shared/supabase-url';

type Env = { SUPABASE_URL?: string; SUPABASE_KEY?: string; SESSIYA_KALIT: string; RESEND_API_KEY?: string; EMAIL_FROM?: string };
const EMAIL = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const json = (b: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(b, { status, headers: { 'Cache-Control': 'no-store', ...headers } });

export function yangiKod(): string {
  const diapazon = 900_000;
  const chegara = Math.floor(0x1_0000_0000 / diapazon) * diapazon;
  const q = new Uint32Array(1);
  do { crypto.getRandomValues(q); } while (q[0] >= chegara);
  return String(100_000 + (q[0] % diapazon));
}
export async function kodXesh(kod: string, email: string, kalit: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(kalit), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const out = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(kod + '|' + email));
  return [...new Uint8Array(out)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function ipBelgi(req: Request): Promise<string | null> {
  const ip = req.headers.get('CF-Connecting-IP') || '';
  if (!ip) return null;
  const x = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip + '|t2ozi'));
  return [...new Uint8Array(x)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}
const originYaroqsiz = (req: Request) => {
  const origin = req.headers.get('Origin');
  return req.headers.get('Sec-Fetch-Site') === 'cross-site' || (!!origin && origin !== new URL(req.url).origin);
};

export function xatTanasi(kod: string): { text: string; html: string } {
  const text = `Smeta OS — kirish kodi: ${kod}\nKod 10 daqiqa amal qiladi. Uni hech kimga bermang.\nAgar siz so'ramagan bo'lsangiz, bu xatni e'tiborsiz qoldiring.`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:420px;margin:0 auto;padding:24px;color:#0e1113">
<p style="font-size:15px;margin:0 0 12px">Smeta OS — kirish kodi</p>
<p style="font-size:34px;letter-spacing:8px;font-weight:700;margin:0 0 12px;color:#0b7a72">${kod}</p>
<p style="font-size:13px;color:#555;margin:0">Kod 10 daqiqa amal qiladi. Uni hech kimga bermang.<br>Agar siz so'ramagan bo'lsangiz, bu xatni e'tiborsiz qoldiring.</p></div>`;
  return { text, html };
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const { SUPABASE_URL, SUPABASE_KEY, SESSIYA_KALIT, RESEND_API_KEY, EMAIL_FROM } = ctx.env;
  if (originYaroqsiz(ctx.request)) return json({ ok: false, code: 'ORIGIN_INVALID' }, 403);
  let b: { amal?: string; email?: string; tasdiqlash_id?: string; kod?: string; ism?: string; operation_id?: string } = {};
  try { b = await ctx.request.json(); } catch { return json({ ok: false, code: 'BODY_INVALID', xabar: 'Noto‘g‘ri so‘rov' }, 400); }
  const email = String(b.email || '').trim().toLowerCase().slice(0, 254);
  if (!EMAIL.test(email)) return json({ ok: false, code: 'EMAIL_NOTOGRI', xabar: 'Email manzilini to‘g‘ri kiriting.' }, 400);
  if (!SUPABASE_URL || !SUPABASE_KEY || !SESSIYA_KALIT || SESSIYA_KALIT.length < 16) return json({ ok: false, code: 'SOZLANMAGAN', xabar: 'Server sozlanmagan.' }, 503);
  const rpc = (nom: string, yuk: unknown) => fetch(supabaseBaseUrl(SUPABASE_URL) + '/rest/v1/rpc/' + nom, {
    method: 'POST', headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(yuk),
  });

  if (b.amal === 'kod') {
    if (!RESEND_API_KEY || !EMAIL_FROM) return json({ ok: false, code: 'EMAIL_XIZMATI_SOZLANMAGAN', xabar: 'Email orqali kirish hali yoqilmagan. Google yoki login-parol bilan kiring.' }, 503);
    const kod = yangiKod();
    try {
      const r = await rpc('t2_email_kod_yarat_v1', { p_email: email, p_kod_xesh: await kodXesh(kod, email, SESSIYA_KALIT), p_ip_belgi: await ipBelgi(ctx.request) });
      if (r.status === 404) return json({ ok: false, code: 'SERVER_YANGILANMAGAN', xabar: 'Email orqali kirish hali yoqilmagan.' }, 503);
      const d = await r.json().catch(() => null) as { ok?: boolean; code?: string; xabar?: string; tasdiqlash_id?: string } | null;
      if (!r.ok || !d) return json({ ok: false, code: 'SERVER_XATO', xabar: 'Kod yuborib bo‘lmadi. Keyinroq urinib ko‘ring.' }, 502);
      if (!d.ok || !d.tasdiqlash_id) return json({ ok: false, code: d.code, xabar: d.xabar || 'Kod yuborib bo‘lmadi.' }, d.code === 'LIMIT' || d.code === 'KOD_KUTILMOQDA' ? 429 : 400);
      const xat = xatTanasi(kod);
      const mail = await fetch('https://api.resend.com/emails', {
        method: 'POST', headers: { Authorization: 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: EMAIL_FROM, to: [email], subject: `Smeta OS — kirish kodi: ${kod}`, text: xat.text, html: xat.html }),
      });
      if (!mail.ok) return json({ ok: false, code: 'EMAIL_YUBORILMADI', xabar: 'Kod yuborib bo‘lmadi. Keyinroq urinib ko‘ring.' }, 502);
      const sent = await rpc('t2_royxat_email_kod_yuborildi_v1', { p_tasdiqlash_id: d.tasdiqlash_id });
      if (!sent.ok) return json({ ok: false, code: 'SERVER_XATO', xabar: 'Kod yuborildi, lekin saqlanmadi. Yangisini so‘rang.' }, 502);
      return json({ ok: true, tasdiqlash_id: d.tasdiqlash_id });
    } catch { return json({ ok: false, code: 'TARMOQ', xabar: 'Tarmoq xatosi. Qayta urinib ko‘ring.' }, 502); }
  }

  if (b.amal === 'tasdiqla') {
    const kod = String(b.kod || '').replace(/\s+/g, '');
    if (!UUID.test(String(b.tasdiqlash_id || '')) || !/^\d{6}$/.test(kod)) return json({ ok: false, code: 'KOD_FORMAT', xabar: 'Emailga kelgan 6 xonali kodni kiriting.' }, 400);
    const opId = UUID.test(String(b.operation_id || '')) ? String(b.operation_id) : crypto.randomUUID();
    const ism = String(b.ism || '').trim().slice(0, 200) || null;
    let d: { ok?: boolean; code?: string; xabar?: string; yangi?: boolean; foydalanuvchi_id?: number; login?: string; rol?: string; azoliklar?: { kompaniya_id: number; rol: string }[]; demo_obyekt_id?: number | null; qolgan_urinish?: number } | null;
    try {
      const r = await rpc('t2_email_kod_kirish_v1', { p_tasdiqlash_id: b.tasdiqlash_id, p_kod_xesh: await kodXesh(kod, email, SESSIYA_KALIT), p_email: email, p_ism: ism, p_ip_belgi: await ipBelgi(ctx.request), p_operation_id: opId });
      if (r.status === 404) return json({ ok: false, code: 'SERVER_YANGILANMAGAN', xabar: 'Email orqali kirish hali yoqilmagan.' }, 503);
      d = await r.json().catch(() => null) as typeof d;
      if (!r.ok) d = null;
    } catch { d = null; }
    if (!d) return json({ ok: false, code: 'SERVER_XATO', xabar: 'Kirib bo‘lmadi. Qayta urinib ko‘ring.' }, 502);
    if (!d.ok || !d.foydalanuvchi_id || !d.login || !d.rol) return json({ ok: false, code: d.code, xabar: d.xabar || 'Kirib bo‘lmadi.', qolgan_urinish: d.qolgan_urinish }, 400);
    let sess: string;
    try { sess = await imzola({ rol: d.rol as Rol, email: d.login, foydalanuvchi_id: d.foydalanuvchi_id, kompaniyalar: d.azoliklar || [] }, SESSIYA_KALIT); }
    catch { return json({ ok: false, code: 'CONFIG', xabar: 'Server sozlanmagan (SESSIYA_KALIT).' }, 503); }
    return json({ ok: true, yangi: !!d.yangi, rol: d.rol, demo: d.demo_obyekt_id != null }, 200,
      { 'Set-Cookie': `sess=${sess}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${Math.floor(SESSIYA_MUDDAT_MS / 1000)}` });
  }

  return json({ ok: false, code: 'AMAL_NOMALUM' }, 400);
};
