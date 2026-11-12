/**
 * foto-dalil.ts — FOTO-DALIL shlyuzi (ekotizim V3, paket P2).
 *
 * Fayl baytlari mavjud kanonik yo'ldan o'tadi (/api/hujjat-yukla: reserve -> R2 put -> finalize, turi='foto_dalil');
 * bu shlyuz faqat BOG'LASH qatlamini (t2_foto_dalil) o'qiydi/yozadi. Faqat sanab o'tilgan RPC lar; actor HAR DOIM sessiyadan;
 * a'zolik/rol tekshiruvi BAZADA. Boshqa tomon agentlari (texnadzor, usta, loyihachi) ham shu shlyuzdan foydalanadi.
 *
 *   GET  /api/foto-dalil?kompaniya_id=&obyekt_id=[&razdel_id=&manba_turi=&manba_id=&dan=&gacha=&limit=&keyin_id=]
 *   POST /api/foto-dalil  { amal: 'bogla' | 'yangila' | 'ochir', kompaniya_id, ... }
 */
import { cachedAuthority } from '../_shared/permission-policy';
import { tekshir } from '../_shared/auth';
import { supabaseBaseUrl } from '../_shared/supabase-url';

type Env = { SUPABASE_URL?: string; SUPABASE_KEY?: string; SESSIYA_KALIT: string };
type Yuk = Record<string, unknown>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TUR = /^[a-z][a-z0-9_]{1,30}$/;
const SANA = /^\d{4}-\d{2}-\d{2}$/;
const sonmi = (v: unknown) => v != null && v !== '' && Number.isSafeInteger(Number(v)) && Number(v) > 0;
const ixtSon = (v: unknown) => (sonmi(v) ? Number(v) : null);
const matn = (v: unknown, n: number) => (v == null || String(v).trim() === '' ? null : String(v).trim().slice(0, n));
const koord = (v: unknown, chegara: number) => { if (v == null || v === '') return null; const x = Number(v); return Number.isFinite(x) && Math.abs(x) <= chegara ? Math.round(x * 1e6) / 1e6 : null; };
const sana = (v: unknown) => (typeof v === 'string' && SANA.test(v) ? v : null);

export function oqishYuki(q: URLSearchParams): Yuk | string {
  if (!sonmi(q.get('kompaniya_id')) || !sonmi(q.get('obyekt_id'))) return 'kompaniya_id va obyekt_id kerak';
  const turi = q.get('manba_turi');
  if (turi && !TUR.test(turi)) return 'manba_turi noto‘g‘ri';
  return {
    p_kompaniya_id: Number(q.get('kompaniya_id')), p_obyekt_id: Number(q.get('obyekt_id')), p_razdel_id: ixtSon(q.get('razdel_id')),
    p_manba_turi: turi || null, p_manba_id: ixtSon(q.get('manba_id')), p_dan: sana(q.get('dan')), p_gacha: sana(q.get('gacha')),
    p_limit: ixtSon(q.get('limit')) ?? 120, p_keyin_id: ixtSon(q.get('keyin_id')),
  };
}

const AI_TAKLIF_KALIT = ['manba_turi', 'manba_id', 'nom', 'ishonch'];
function taklifTozala(v: unknown): Yuk | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Yuk; const out: Yuk = {};
  for (const k of AI_TAKLIF_KALIT) if (o[k] != null) out[k] = k === 'nom' ? String(o[k]).slice(0, 200) : k === 'manba_id' || k === 'ishonch' ? Number(o[k]) : String(o[k]).slice(0, 31);
  return Object.keys(out).length ? out : null;
}

export function yozishYuki(amal: string, so: Yuk): { nom: string; yuk: Yuk } | string {
  if (!sonmi(so.kompaniya_id)) return 'kompaniya_id kerak';
  const p_kompaniya_id = Number(so.kompaniya_id);
  switch (amal) {
    case 'bogla': {
      if (!sonmi(so.obyekt_id) || !sonmi(so.document_id)) return 'obyekt_id va document_id kerak';
      const turi = so.manba_turi == null || so.manba_turi === '' ? 'umumiy' : String(so.manba_turi);
      if (!TUR.test(turi)) return 'manba_turi noto‘g‘ri';
      if (turi !== 'umumiy' && !sonmi(so.manba_id)) return 'manba_id kerak';
      const op = typeof so.operation_id === 'string' && UUID.test(so.operation_id) ? so.operation_id : crypto.randomUUID();
      return { nom: 't2_foto_dalil_bogla_v1', yuk: { p_kompaniya_id, p_obyekt_id: Number(so.obyekt_id), p_document_id: Number(so.document_id), p_manba_turi: turi,
        p_manba_id: turi === 'umumiy' ? null : Number(so.manba_id), p_sana: sana(so.sana), p_lat: koord(so.lat, 90), p_lng: koord(so.lng, 180), p_izoh: matn(so.izoh, 500), p_operation_id: op } };
    }
    case 'yangila': {
      if (!sonmi(so.id)) return 'id kerak';
      const ozgar = so.manba_ozgar === true;
      if (ozgar && so.manba_turi !== 'umumiy' && (!TUR.test(String(so.manba_turi ?? '')) || !sonmi(so.manba_id))) return 'manba_turi va manba_id kerak';
      return { nom: 't2_foto_dalil_yangila_v1', yuk: { p_kompaniya_id, p_id: Number(so.id), p_izoh: so.izoh === undefined ? null : (so.izoh === null ? '' : matn(so.izoh, 500) ?? ''),
        p_ai_izoh: matn(so.ai_izoh, 500), p_ai_taklif: taklifTozala(so.ai_taklif), p_manba_ozgar: ozgar,
        p_manba_turi: ozgar ? String(so.manba_turi) : null, p_manba_id: ozgar && so.manba_turi !== 'umumiy' ? Number(so.manba_id) : null } };
    }
    case 'ochir':
      return sonmi(so.id) ? { nom: 't2_foto_dalil_ochir_v1', yuk: { p_kompaniya_id, p_id: Number(so.id) } } : 'id kerak';
    default: return 'Amal ochiq emas';
  }
}

const JAVOB = { headers: { 'Cache-Control': 'no-store' } };

export function xatoJavobi(text: string): { status: number; body: Yuk } {
  let code = '';
  try { code = (JSON.parse(text) as { code?: string }).code ?? ''; } catch { /* matn emas */ }
  if (code === '42501') return { status: 403, body: { ok: false, code: 'AZO_EMAS', error: 'Siz bu kompaniyaning faol a’zosi emassiz' } };
  if (code === '22023') return { status: 400, body: { ok: false, error: 'Noto‘g‘ri so‘rov' } };
  return { status: 502, body: { ok: false, error: 'Server xatosi' } };
}

async function rpc(env: Env, nom: string, yuk: Yuk): Promise<Response> {
  const r = await fetch(supabaseBaseUrl(env.SUPABASE_URL!) + '/rest/v1/rpc/' + nom, {
    method: 'POST', headers: { apikey: env.SUPABASE_KEY!, Authorization: 'Bearer ' + env.SUPABASE_KEY!, 'Content-Type': 'application/json' }, body: JSON.stringify(yuk),
  });
  const text = await r.text();
  if (!r.ok) { const e = xatoJavobi(text); return Response.json(e.body, { status: e.status, ...JAVOB }); }
  try { return Response.json(JSON.parse(text), JAVOB); } catch { return Response.json({ ok: false, error: 'Noto‘g‘ri javob' }, { status: 502, ...JAVOB }); }
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
  const yuk = oqishYuki(new URL(ctx.request.url).searchParams);
  if (typeof yuk === 'string') return Response.json({ ok: false, error: yuk }, { status: 400 });
  return rpc(ctx.env, 't2_foto_dalil_royxat_v1', { p_actor_id: a, ...yuk });
};

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const a = await actor(ctx); if (a instanceof Response) return a;
  let so: Yuk = {};
  try { so = await ctx.request.json(); } catch { return Response.json({ ok: false, error: 'Noto‘g‘ri so‘rov' }, { status: 400 }); }
  const y = yozishYuki(String(so.amal || ''), so);
  if (typeof y === 'string') return Response.json({ ok: false, error: y }, { status: 400 });
  return rpc(ctx.env, y.nom, { p_actor_id: a, ...y.yuk });
};
