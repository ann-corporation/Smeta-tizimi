/**
 * mutaxassis.ts — MUTAXASSIS PROFILI va XIZMAT TAKLIFI shlyuzi (T6, egasi 2026-10-22).
 * Mutaxassis (PTO, smetachi …) hali kompaniya a'zosi emas — shuning uchun middleware ruxsat ro'yxatida emas; actor HAR DOIM
 * sessiyadan, a'zolik/ruxsat (company.member.manage, company.profile.update), cheklov va izolyatsiya — har RPC ichida BAZADA.
 * Ixtiyoriy RPC nomi qabul qilinmaydi: faqat mutaxassis-yuk.ts dagi sanab o'tilgan bo'lim/amallar.
 */
import { cachedAuthority } from '../_shared/permission-policy';
import { tekshir } from '../_shared/auth';
import { supabaseBaseUrl } from '../_shared/supabase-url';
import { vakolatKeshTozala } from '../_shared/role-authority';
import { oqishYuki, yozishYuki } from '../_shared/mutaxassis-yuk';

type Env = { SUPABASE_URL?: string; SUPABASE_KEY?: string; SESSIYA_KALIT: string };
type Yuk = Record<string, unknown>;
const JAVOB = { headers: { 'Cache-Control': 'no-store' } };

function xatoJavobi(text: string): { status: number; body: Yuk } {
  let code = ''; let msg = '';
  try { const j = JSON.parse(text) as { code?: string; message?: string }; code = j.code ?? ''; msg = j.message ?? ''; } catch { /* matn emas */ }
  if (code === '42501' || /PERMISSION_DENIED|a'zo|azo/i.test(msg)) return { status: 403, body: { ok: false, code: 'RUXSAT_YOQ', error: 'Bu amal uchun ruxsatingiz yo‘q' } };
  if (code === '22023') return { status: 400, body: { ok: false, error: 'Noto‘g‘ri so‘rov' } };
  return { status: 502, body: { ok: false, error: 'Server xatosi' } };
}

async function rpc(env: Env, nom: string, yuk: Yuk): Promise<{ status: number; body: Yuk }> {
  const r = await fetch(supabaseBaseUrl(env.SUPABASE_URL!) + '/rest/v1/rpc/' + nom, {
    method: 'POST', headers: { apikey: env.SUPABASE_KEY!, Authorization: 'Bearer ' + env.SUPABASE_KEY!, 'Content-Type': 'application/json' }, body: JSON.stringify(yuk),
  });
  const text = await r.text();
  if (!r.ok) return xatoJavobi(text);
  try { const d = JSON.parse(text) as Yuk; return { status: 200, body: d && typeof d === 'object' ? d : { ok: false } }; }
  catch { return { status: 502, body: { ok: false, error: 'Noto‘g‘ri javob' } }; }
}

async function actor(ctx: EventContext<Env, string, unknown>): Promise<number | Response> {
  if (!ctx.env.SUPABASE_URL || !ctx.env.SUPABASE_KEY) return Response.json({ ok: false, error: 'Server sozlanmagan' }, { status: 503 });
  const sess = cachedAuthority(ctx) ?? await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT).catch(() => null);
  if (!sess) return Response.json({ ok: false, error: 'Kirish talab qilinadi' }, { status: 401 });
  if (!Number.isSafeInteger(sess.foydalanuvchi_id) || (sess.foydalanuvchi_id as number) <= 0) return Response.json({ ok: false, error: 'Sessiyada foydalanuvchi yo‘q' }, { status: 401 });
  return sess.foydalanuvchi_id as number;
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const a = await actor(ctx); if (a instanceof Response) return a;
  const u = new URL(ctx.request.url);
  const t = oqishYuki(u.searchParams.get('bolim') ?? '', u.searchParams);
  if (typeof t === 'string') return Response.json({ ok: false, error: t }, { status: 400 });
  const r = await rpc(ctx.env, t.rpc, { p_actor_id: a, ...t.yuk });
  return Response.json(r.body, { status: r.status, ...JAVOB });
};

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const a = await actor(ctx); if (a instanceof Response) return a;
  let so: Yuk = {};
  try { so = await ctx.request.json(); } catch { return Response.json({ ok: false, error: 'Noto‘g‘ri so‘rov' }, { status: 400 }); }
  const amal = String(so.amal || '');
  const t = yozishYuki(amal, so);
  if (typeof t === 'string') return Response.json({ ok: false, error: t }, { status: 400 });
  const r = await rpc(ctx.env, t.rpc, { p_actor_id: a, ...t.yuk });
  // Qabul qilingan mutaxassis yangi a'zo bo'ladi — uning vakolat keshi (shu isolate'da) darhol yangilansin.
  if (amal === 'taklif_javob' && r.body.ok === true) vakolatKeshTozala();
  return Response.json(r.body, { status: r.status, ...JAVOB });
};
