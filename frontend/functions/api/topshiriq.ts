/**
 * topshiriq.ts - P1 TOPSHIRIQ shlyuzi (E7 §3.2). Actor HAR DOIM sessiyadan; a'zolik, rol, tomon va o'tish qoidalari BAZADA (RPC).
 *   GET  ?yonalish=menga|mendan&kompaniya_id=&holat=&obyekt_id=&keyin_id=&limit=
 *   POST { amal:'ber', kompaniya_id, operation_id, tur, ijrochi_kompaniya_id?, ijrochi_foydalanuvchi_id?, aloqa_id?, obyekt_id?, sarlavha, matn?, muddat? }
 *   POST { amal:'otish', kompaniya_id, operation_id, topshiriq_id, kutilgan_versiya, holat, izoh?, dalil_hujjat_idlar? }
 * RPC nomlari qat'iy ro'yxatdan. Middleware ruxsat ro'yxatida emas (ijrochi usta fakt.write ga ega emas): ruxsat RPC ichida.
 */
import { cachedAuthority } from '../_shared/permission-policy';
import { tekshir } from '../_shared/auth';
import { supabaseBaseUrl } from '../_shared/supabase-url';

type Env = { SUPABASE_URL?: string; SUPABASE_KEY?: string; SESSIYA_KALIT: string };
type Yuk = Record<string, unknown>;
const JAVOB = { headers: { 'Cache-Control': 'no-store' } };
const TURLAR = ['ish', 'reys', 'tamir', 'tekshiruv', 'tuzatish', 'boshqa'];
const HOLATLAR = ['berildi', 'qabul_qilindi', 'rad', 'bajarilmoqda', 'bajarildi', 'tasdiqlandi', 'qaytarildi', 'bekor'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const butun = (v: unknown): number | null => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isSafeInteger(n) && n > 0 ? n : null;
};
const matn = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.slice(0, max) : null);

export function xatoJavobi(text: string): { status: number; body: Yuk } {
  let code = ''; let msg = '';
  try { const j = JSON.parse(text) as { code?: string; message?: string }; code = j.code ?? ''; msg = j.message ?? ''; } catch { /* matn emas */ }
  if (code === '42501' || /PERMISSION_DENIED/i.test(msg)) return { status: 403, body: { ok: false, code: 'RUXSAT_YOQ', error: 'Bu amal uchun ruxsatingiz yo‘q' } };
  if (code === '22023') return { status: 400, body: { ok: false, error: 'Noto‘g‘ri so‘rov' } };
  return { status: 502, body: { ok: false, error: 'Server xatosi' } };
}

/** So'rov tanasini RPC yukiga aylantiradi; xato bo'lsa matn qaytaradi. Sof funksiya (test uchun). */
export function yozishYuki(so: Yuk): { rpc: string; yuk: Yuk } | string {
  const kompaniya = butun(so.kompaniya_id);
  if (!kompaniya) return 'Kompaniya ko‘rsatilmagan';
  if (typeof so.operation_id !== 'string' || !UUID.test(so.operation_id)) return 'operation_id kerak';
  if (so.amal === 'ber') {
    const sarlavha = matn(so.sarlavha, 200);
    if (!sarlavha) return 'Sarlavha kerak';
    const tur = typeof so.tur === 'string' ? so.tur : 'ish';
    if (!TURLAR.includes(tur)) return 'Tur noto‘g‘ri';
    return { rpc: 't2_topshiriq_ber_v1', yuk: {
      p_kompaniya_id: kompaniya, p_operation_id: so.operation_id, p_tur: tur,
      p_ijrochi_kompaniya_id: butun(so.ijrochi_kompaniya_id), p_ijrochi_foydalanuvchi_id: butun(so.ijrochi_foydalanuvchi_id),
      p_aloqa_id: butun(so.aloqa_id), p_obyekt_id: butun(so.obyekt_id), p_sarlavha: sarlavha, p_matn: matn(so.matn, 4000),
      p_muddat: typeof so.muddat === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(so.muddat) ? so.muddat : null, p_manba: null, p_meta: null } };
  }
  if (so.amal === 'otish') {
    const id = butun(so.topshiriq_id); const ver = butun(so.kutilgan_versiya);
    if (!id || !ver) return 'topshiriq_id va kutilgan_versiya kerak';
    if (typeof so.holat !== 'string' || !HOLATLAR.includes(so.holat)) return 'Holat noto‘g‘ri';
    const dalil = Array.isArray(so.dalil_hujjat_idlar) ? so.dalil_hujjat_idlar.map(butun).filter((x): x is number => x !== null).slice(0, 20) : [];
    return { rpc: 't2_topshiriq_otish_v1', yuk: {
      p_kompaniya_id: kompaniya, p_operation_id: so.operation_id, p_topshiriq_id: id, p_kutilgan_versiya: ver,
      p_holat: so.holat, p_izoh: matn(so.izoh, 1000), p_dalil_hujjat_idlar: dalil } };
  }
  return 'Amal noma‘lum';
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
  const q = new URL(ctx.request.url).searchParams;
  const kompaniya = butun(q.get('kompaniya_id')); const yonalish = q.get('yonalish');
  if (!kompaniya || (yonalish !== 'menga' && yonalish !== 'mendan')) return Response.json({ ok: false, error: 'So‘rov noto‘g‘ri' }, { status: 400 });
  const holat = q.get('holat');
  if (holat && !HOLATLAR.includes(holat)) return Response.json({ ok: false, error: 'Holat noto‘g‘ri' }, { status: 400 });
  const r = await rpc(ctx.env, 't2_topshiriqlar_v1', {
    p_actor_id: a, p_kompaniya_id: kompaniya, p_yonalish: yonalish, p_holat: holat || null,
    p_obyekt_id: butun(q.get('obyekt_id')), p_limit: Math.min(butun(q.get('limit')) ?? 30, 100), p_keyin_id: butun(q.get('keyin_id')) });
  return Response.json(r.body, { status: r.status, ...JAVOB });
};

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const a = await actor(ctx); if (a instanceof Response) return a;
  let so: Yuk = {};
  try { so = await ctx.request.json(); } catch { return Response.json({ ok: false, error: 'Noto‘g‘ri so‘rov' }, { status: 400 }); }
  const t = yozishYuki(so);
  if (typeof t === 'string') return Response.json({ ok: false, error: t }, { status: 400 });
  const r = await rpc(ctx.env, t.rpc, { p_actor_id: a, ...t.yuk });
  return Response.json(r.body, { status: r.status, ...JAVOB });
};
