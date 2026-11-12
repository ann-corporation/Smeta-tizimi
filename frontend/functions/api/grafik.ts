/**
 * grafik.ts - P6 GRAFIK + P7 CASHFLOW shlyuzi. Actor HAR DOIM sessiyadan; a'zolik, rol va tomon grant tekshiruvi BAZADA (RPC).
 *   GET  ?kompaniya_id=&obyekt_id=                          -> t2_grafik_reja_v1 (pudratchi a'zosi)
 *   GET  ?kompaniya_id=&obyekt_id=&beruvchi_kompaniya_id=   -> t2_tomon_grafik_v1 (buyurtmachi: grant 'grafik'/'korish')
 *   POST { amal:'sozlama', kompaniya_id, obyekt_id, razdel_id (0 = obyekt sukuti), brigada?, smena_soat?, boshlanish_sana?, kun?, kutilgan_versiya?, tozala? }
 * Ixtiyoriy jadval/RPC nomi qabul qilinmaydi; faqat ikki RPC (o'qish) va bitta RPC (yozish).
 */
import { cachedAuthority } from '../_shared/permission-policy';
import { tekshir } from '../_shared/auth';
import { supabaseBaseUrl } from '../_shared/supabase-url';

type Env = { SUPABASE_URL?: string; SUPABASE_KEY?: string; SESSIYA_KALIT: string };
type Yuk = Record<string, unknown>;
const JAVOB = { headers: { 'Cache-Control': 'no-store' } };

export const butun = (v: unknown): number | null => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isSafeInteger(n) && n > 0 ? n : null;
};
const sana = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null);
const oraliq = (v: unknown, a: number, b: number): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= a && n <= b ? n : NaN;
};

export function xatoJavobi(text: string): { status: number; body: Yuk } {
  let code = ''; let msg = '';
  try { const j = JSON.parse(text) as { code?: string; message?: string }; code = j.code ?? ''; msg = j.message ?? ''; } catch { /* matn emas */ }
  if (code === '42501' && /TOMON_RUXSAT_YOQ/.test(msg)) return { status: 403, body: { ok: false, code: 'TOMON_RUXSAT_YOQ', error: 'Bu obyektning grafigini ko‘rishga ruxsat berilmagan' } };
  if (code === '42501' && /GRAFIK_RUXSAT_YOQ/.test(msg)) return { status: 403, body: { ok: false, code: 'RUXSAT_YOQ', error: 'Grafik sozlamasini o‘zgartirish huquqingiz yo‘q' } };
  if (code === '42501') return { status: 403, body: { ok: false, code: 'AZO_EMAS', error: 'Siz bu kompaniyaning faol a’zosi emassiz' } };
  if (code === '22023') return { status: 400, body: { ok: false, error: 'Noto‘g‘ri so‘rov' } };
  return { status: 502, body: { ok: false, error: 'Server xatosi' } };
}

/** O'qish so'rovini RPC yukiga aylantiradi (sof funksiya). */
export function oqishYuki(q: URLSearchParams): { rpc: string; yuk: Yuk } | string {
  const kompaniya = butun(q.get('kompaniya_id')); const obyekt = butun(q.get('obyekt_id'));
  if (!kompaniya || !obyekt) return 'kompaniya_id va obyekt_id kerak';
  const beruvchi = q.get('beruvchi_kompaniya_id');
  if (beruvchi != null && beruvchi !== '') {
    const b = butun(beruvchi);
    if (!b) return 'beruvchi_kompaniya_id noto‘g‘ri';
    return { rpc: 't2_tomon_grafik_v1', yuk: { p_kompaniya_id: kompaniya, p_beruvchi_kompaniya_id: b, p_obyekt_id: obyekt } };
  }
  return { rpc: 't2_grafik_reja_v1', yuk: { p_kompaniya_id: kompaniya, p_obyekt_id: obyekt } };
}

/** Yozish tanasini RPC yukiga aylantiradi (sof funksiya). */
export function yozishYuki(so: Yuk): { rpc: string; yuk: Yuk } | string {
  if (so.amal !== 'sozlama') return 'Amal nomalum';
  const kompaniya = butun(so.kompaniya_id); const obyekt = butun(so.obyekt_id);
  if (!kompaniya || !obyekt) return 'kompaniya_id va obyekt_id kerak';
  const razdel = so.razdel_id == null || so.razdel_id === 0 || so.razdel_id === '0' ? 0 : butun(so.razdel_id);
  if (razdel == null) return 'razdel_id noto‘g‘ri';
  const brigada = oraliq(so.brigada, 1, 1000); const smena = oraliq(so.smena_soat, 0.5, 24); const kun = oraliq(so.kun, 1, 3650);
  if (Number.isNaN(brigada) || Number.isNaN(smena) || Number.isNaN(kun)) return 'Brigada 1-1000, smena 0,5-24 soat, kun 1-3650 bo‘lishi kerak';
  if (brigada != null && !Number.isInteger(brigada)) return 'Brigada butun son bo‘lishi kerak';
  if (kun != null && !Number.isInteger(kun)) return 'Kun butun son bo‘lishi kerak';
  const bosh = so.boshlanish_sana == null || so.boshlanish_sana === '' ? null : sana(so.boshlanish_sana);
  if (so.boshlanish_sana != null && so.boshlanish_sana !== '' && !bosh) return 'Sana YYYY-MM-DD bo‘lishi kerak';
  const ver = so.kutilgan_versiya == null || so.kutilgan_versiya === '' ? null : butun(so.kutilgan_versiya);
  if (so.kutilgan_versiya != null && so.kutilgan_versiya !== '' && !ver) return 'kutilgan_versiya noto‘g‘ri';
  return { rpc: 't2_grafik_sozlama_saqla_v1', yuk: {
    p_kompaniya_id: kompaniya, p_obyekt_id: obyekt, p_razdel_id: razdel, p_brigada: brigada, p_smena_soat: smena,
    p_boshlanish_sana: bosh, p_kun: kun, p_kutilgan_versiya: ver, p_tozala: so.tozala === true } };
}

async function rpc(env: Env, nom: string, yuk: Yuk): Promise<Response> {
  const r = await fetch(supabaseBaseUrl(env.SUPABASE_URL!) + '/rest/v1/rpc/' + nom, {
    method: 'POST', headers: { apikey: env.SUPABASE_KEY!, Authorization: 'Bearer ' + env.SUPABASE_KEY!, 'Content-Type': 'application/json' }, body: JSON.stringify(yuk),
  });
  const text = await r.text();
  if (!r.ok) { const e = xatoJavobi(text); return Response.json(e.body, { status: e.status, ...JAVOB }); }
  let d: unknown = null;
  try { d = JSON.parse(text); } catch { return Response.json({ ok: false, error: 'Noto‘g‘ri javob' }, { status: 502, ...JAVOB }); }
  if (d && typeof d === 'object' && !Array.isArray(d) && typeof (d as { ok?: unknown }).ok === 'boolean') return Response.json(d, JAVOB);
  return Response.json({ ok: true, natija: d }, JAVOB);
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
  const y = oqishYuki(new URL(ctx.request.url).searchParams);
  if (typeof y === 'string') return Response.json({ ok: false, error: y }, { status: 400 });
  return rpc(ctx.env, y.rpc, { p_actor_id: a, ...y.yuk });
};

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const a = await actor(ctx); if (a instanceof Response) return a;
  let so: Yuk = {};
  try { so = await ctx.request.json(); } catch { return Response.json({ ok: false, error: 'Noto‘g‘ri so‘rov' }, { status: 400 }); }
  const y = yozishYuki(so);
  if (typeof y === 'string') return Response.json({ ok: false, error: y }, { status: 400 });
  return rpc(ctx.env, y.rpc, { p_actor_id: a, ...y.yuk });
};
