/**
 * kirish-google.ts — GOOGLE (Gmail) BILAN KIRISH (egasi, 2026-10-02).
 *
 * GET  → { ok, clientId } — sahifa Google tugmasini chizishi uchun (Client ID maxfiy emas; env: GOOGLE_CLIENT_ID).
 * POST { credential } → Google ID tokeni (JWT, RS256) SHU YERDA tekshiriladi:
 *   imzo (Google JWKS), aud = GOOGLE_CLIENT_ID, iss = accounts.google.com, exp, email_verified.
 * So'ng `t2_google_kirish_v1` (mavjud hisob yoki yangi: faqat shaxsiy hisob, a'zoliksiz — 20261111460000) va odatdagi
 * `t2_kirish_royxatga_ol` → /api/kirish bilan bir xil imzolangan sessiya cookie.
 */
import { imzola, SESSIYA_MUDDAT_MS, type Rol } from '../_shared/auth';
import { supabaseBaseUrl } from '../_shared/supabase-url';
import { googleKalitlar, googleOriginlar, googleTokenTekshir, STANDART_CLIENT_ID } from '../_shared/google-id';

export { googleTokenTekshir, googleOriginlar };
export type { GoogleProfil } from '../_shared/google-id';

type Env = { SUPABASE_URL?: string; SUPABASE_KEY?: string; SESSIYA_KALIT: string; GOOGLE_CLIENT_ID?: string };

export const onRequestGet: PagesFunction<Env & { GOOGLE_ORIGINS?: string }> = async (ctx) =>
  Response.json({ ok: true, clientId: ctx.env.GOOGLE_CLIENT_ID || STANDART_CLIENT_ID, originlar: googleOriginlar(ctx.env) });

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const { SUPABASE_URL, SUPABASE_KEY } = ctx.env;
  const GOOGLE_CLIENT_ID = ctx.env.GOOGLE_CLIENT_ID || STANDART_CLIENT_ID;
  if (!GOOGLE_CLIENT_ID || !SUPABASE_URL || !SUPABASE_KEY) return Response.json({ ok: false, xato: 'Google bilan kirish hali sozlanmagan' }, { status: 503 });
  let so: { credential?: string } = {};
  try { so = await ctx.request.json(); } catch { return Response.json({ ok: false, xato: 'Noto‘g‘ri so‘rov' }, { status: 400 }); }
  const token = String(so.credential || '');
  if (!token || token.length > 4096) return Response.json({ ok: false, xato: 'Google javobi yo‘q' }, { status: 400 });

  let t: Awaited<ReturnType<typeof googleTokenTekshir>>;
  try { t = await googleTokenTekshir(token, GOOGLE_CLIENT_ID, await googleKalitlar()); }
  catch { return Response.json({ ok: false, xato: 'Google bilan bog‘lanib bo‘lmadi. Qayta urinib ko‘ring.' }, { status: 502 }); }
  if (!t.ok) return Response.json({ ok: false, xato: 'Google tasdig‘i yaroqsiz (' + t.sabab + ')' }, { status: 401 });

  const ip = ctx.request.headers.get('CF-Connecting-IP') || '';
  let ipBelgi: string | null = null;
  if (ip) {
    const x = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip + '|t2ozi'));
    ipBelgi = [...new Uint8Array(x)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  const rpc = (nom: string, yuk: unknown) => fetch(supabaseBaseUrl(SUPABASE_URL) + '/rest/v1/rpc/' + nom, {
    method: 'POST', headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(yuk),
  });

  const g = await rpc('t2_google_kirish_v1', { p_email: t.p.email, p_ism: t.p.ism, p_sub: t.p.sub, p_ip_belgi: ipBelgi, p_operation_id: crypto.randomUUID() })
    .then((r) => r.json()).catch(() => null) as { ok?: boolean; code?: string; xabar?: string; login?: string; rol?: string; yangi?: boolean; ulandi?: boolean; demo_obyekt_id?: number | null } | null;
  if (!g?.ok || !g.login || !g.rol) {
    const xabar = g?.xabar || (g?.code === 'GOOGLE_BOSHQA_HISOB' ? 'Bu email boshqa Google hisobiga bog‘langan.' : g?.code === 'FOYDALANUVCHI_FAOL_EMAS' ? 'Hisob faol emas.' : 'Google bilan kirib bo‘lmadi.');
    return Response.json({ ok: false, code: g?.code, xato: xabar }, { status: 400 });
  }

  const a = await rpc('t2_kirish_royxatga_ol', { p_login: g.login, p_rol: g.rol, p_gas_verified_parol: null })
    .then((r) => r.json()).catch(() => null) as { ok?: boolean; foydalanuvchi_id?: number; azoliklar?: { kompaniya_id: number; rol: string }[] } | null;
  if (!a?.ok || a.foydalanuvchi_id == null) return Response.json({ ok: false, code: 'ACTOR_RESOLVE_FAILED', xato: 'Kirish tasdiqlandi, lekin foydalanuvchi yozuvi olinmadi. Qayta urinib ko‘ring.' }, { status: 502 });

  let sess: string;
  try { sess = await imzola({ rol: g.rol as Rol, email: g.login, foydalanuvchi_id: a.foydalanuvchi_id, kompaniyalar: a.azoliklar || [] }, ctx.env.SESSIYA_KALIT); }
  catch { return Response.json({ ok: false, code: 'CONFIG', xato: 'Server sozlanmagan (SESSIYA_KALIT).' }, { status: 503 }); }
  return new Response(JSON.stringify({ ok: true, rol: g.rol, yangi: !!g.yangi, ulandi: !!g.ulandi, demo: g.demo_obyekt_id != null }), {
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': `sess=${sess}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${Math.floor(SESSIYA_MUDDAT_MS / 1000)}` },
  });
};
