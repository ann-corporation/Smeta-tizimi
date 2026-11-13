/**
 * laboratoriya.ts — LABORATORIYA tomoni shlyuzi: pudratchi sinov so'rovi ↔ laboratoriya protokoli (ekotizim V3).
 * /api/tomon va /api/hujjat-aylanish kabi: ixtiyoriy jadval/RPC nomi qabul qilinmaydi (faqat quyidagi ro'yxat), actor HAR DOIM sessiyadan,
 * a'zolik, rol va aloqa tekshiruvi BAZADA (RPC birinchi qatori). Kompaniyalararo ko'rinish faqat faol aloqa orqali.
 */
import { cachedAuthority } from '../_shared/permission-policy';
import { tekshir } from '../_shared/auth';
import { supabaseBaseUrl } from '../_shared/supabase-url';
import { xatoJavobi } from './tomon';

type Env = { SUPABASE_URL?: string; SUPABASE_KEY?: string; SESSIYA_KALIT: string };
type Yuk = Record<string, unknown>;

const OQISH: Record<string, string> = {
  turlar: 't2_lab_sinov_turlari_v1',
  royxat: 't2_lab_sorov_royxat_v1',
  tafsilot: 't2_lab_sorov_tafsilot_v1',
  aosr_holat: 't2_lab_sorov_aosr_holat_v1',
  /* Faol granti (lab_natija) bor uchinchi tomon (texnadzor, buyurtmachi): natijani faqat O'QIYDI. */
  natija_royxat: 't2_lab_natija_royxat_v1',
  natija_tafsilot: 't2_lab_natija_tafsilot_v1',
};
const YOZISH: Record<string, string> = {
  sorov_yarat: 't2_lab_sorov_yarat_v1',
  natija: 't2_lab_sorov_natija_v1',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sonmi = (v: unknown) => v != null && v !== '' && Number.isSafeInteger(Number(v)) && Number(v) > 0;
const ixtSon = (v: unknown) => (sonmi(v) ? Number(v) : null);
const matn = (v: unknown, n: number) => (v == null || String(v).trim() === '' ? null : String(v).trim().slice(0, n));
const opId = (v: unknown) => (typeof v === 'string' && UUID.test(v) ? v : crypto.randomUUID());
const KALIT = /^[a-z][a-z0-9_]{1,40}$/;
const SANA = /^\d{4}-\d{2}-\d{2}$/;

/** Natija maydonlari: faqat sodda qiymatlar (matn/son), ko'pi bilan 40 ta; to'liq tekshiruv bazada (katalog bo'yicha). */
export function maydonTozala(v: unknown): Yuk | string {
  if (v == null) return {};
  if (typeof v !== 'object' || Array.isArray(v)) return 'maydon: obyekt kerak';
  const out: Yuk = {};
  const e = Object.entries(v as Yuk);
  if (e.length > 40) return 'maydon: ko‘pi bilan 40 ta';
  for (const [k, x] of e) {
    if (!KALIT.test(k)) return 'maydon kaliti noto‘g‘ri';
    if (x == null || x === '') continue;
    if (typeof x !== 'string' && typeof x !== 'number') return 'maydon qiymati matn yoki son bo‘lishi kerak';
    out[k] = typeof x === 'string' ? x.trim().slice(0, 500) : x;
  }
  return out;
}

export function yozishYuki(amal: string, so: Yuk): Yuk | string {
  if (!sonmi(so.kompaniya_id)) return 'kompaniya_id kerak';
  const p_kompaniya_id = Number(so.kompaniya_id);
  switch (amal) {
    case 'sorov_yarat': {
      if (!sonmi(so.aloqa_id)) return 'aloqa_id kerak';
      const asl = ixtSon(so.asl_sorov_id);
      if (!asl && !KALIT.test(String(so.sinov_turi ?? ''))) return 'sinov_turi kerak';
      const muddat = so.muddat == null || so.muddat === '' ? null : String(so.muddat);
      if (muddat != null && !SANA.test(muddat)) return 'muddat YYYY-MM-DD bo‘lishi kerak';
      const ns = so.namuna_soni == null || so.namuna_soni === '' ? null : Number(so.namuna_soni);
      if (ns != null && (!Number.isInteger(ns) || ns < 1 || ns > 1000)) return 'namuna_soni 1–1000';
      return { p_kompaniya_id, p_aloqa_id: Number(so.aloqa_id), p_sinov_turi: so.sinov_turi ? String(so.sinov_turi) : null, p_obyekt_id: ixtSon(so.obyekt_id), p_aosr_id: ixtSon(so.aosr_id),
               p_qator_id: ixtSon(so.qator_id), p_konstruksiya: matn(so.konstruksiya, 300), p_joy: matn(so.joy, 300), p_namuna_soni: ns, p_muddat: muddat, p_izoh: matn(so.izoh, 1500),
               p_majburiy: so.majburiy === false ? false : true, p_asl_sorov_id: asl, p_operation_id: opId(so.operation_id) };
    }
    case 'natija': {
      if (!sonmi(so.murojaat_id) || !sonmi(so.versiya)) return 'murojaat_id va versiya kerak';
      if (!['mos', 'mos_emas'].includes(String(so.natija))) return 'natija: mos | mos_emas';
      const idlar = Array.isArray(so.document_ids) ? (so.document_ids as unknown[]) : [];
      if (idlar.length > 10 || !idlar.every(sonmi)) return 'document_ids: ko‘pi bilan 10 ta musbat son';
      const maydon = maydonTozala(so.maydon);
      if (typeof maydon === 'string') return maydon;
      for (const k of ['protokol_sana', 'invoys_sana', 'bartaraf_muddati']) { const x = so[k]; if (x != null && x !== '' && !SANA.test(String(x))) return `${k} YYYY-MM-DD bo‘lishi kerak`; }
      const summa = so.summa == null || so.summa === '' ? null : Number(String(so.summa).replace(/\s/g, '').replace(',', '.'));
      if (summa != null && !Number.isFinite(summa)) return 'summa son bo‘lishi kerak';
      return { p_kompaniya_id, p_murojaat_id: Number(so.murojaat_id), p_kutilgan_versiya: Number(so.versiya), p_document_ids: idlar.map(Number),
               p_malumot: { natija: String(so.natija), protokol_raqam: matn(so.protokol_raqam, 100), protokol_sana: matn(so.protokol_sana, 10), xulosa: matn(so.xulosa, 2000), maydon,
                            summa, invoys_raqam: matn(so.invoys_raqam, 100), invoys_sana: matn(so.invoys_sana, 10), bartaraf_muddati: matn(so.bartaraf_muddati, 10) } };
    }
    default: return 'Amal ochiq emas';
  }
}

export function oqishYuki(bolim: string, q: URLSearchParams): Yuk | string {
  const k = q.get('kompaniya_id');
  if (!sonmi(k)) return 'kompaniya_id kerak';
  const p_kompaniya_id = Number(k);
  switch (bolim) {
    case 'turlar': return { p_kompaniya_id };
    case 'royxat': {
      const y = q.get('yonalish'), h = q.get('holat');
      return { p_kompaniya_id, p_yonalish: y === 'kelgan' ? 'kelgan' : 'yuborilgan', p_holat: h && /^[a-z_]{3,20}$/.test(h) ? h : null, p_obyekt_id: ixtSon(q.get('obyekt_id')),
               p_aosr_id: ixtSon(q.get('aosr_id')), p_limit: ixtSon(q.get('limit')) ?? 100 };
    }
    case 'tafsilot': return sonmi(q.get('murojaat_id')) ? { p_kompaniya_id, p_murojaat_id: Number(q.get('murojaat_id')) } : 'murojaat_id kerak';
    case 'natija_royxat': return { p_kompaniya_id, p_obyekt_id: ixtSon(q.get('obyekt_id')), p_limit: ixtSon(q.get('limit')) ?? 100 };
    case 'natija_tafsilot': return sonmi(q.get('murojaat_id')) ? { p_kompaniya_id, p_murojaat_id: Number(q.get('murojaat_id')) } : 'murojaat_id kerak';
    case 'aosr_holat': return sonmi(q.get('obyekt_id')) ? { p_kompaniya_id, p_obyekt_id: Number(q.get('obyekt_id')) } : 'obyekt_id kerak';
    default: return 'Bo‘lim ochiq emas';
  }
}

const JAVOB = { headers: { 'Cache-Control': 'no-store' } };

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
  const u = new URL(ctx.request.url);
  const bolim = u.searchParams.get('bolim') || '';
  const nom = OQISH[bolim];
  if (!nom) return Response.json({ ok: false, error: 'Bo‘lim ochiq emas' }, { status: 400 });
  const yuk = oqishYuki(bolim, u.searchParams);
  if (typeof yuk === 'string') return Response.json({ ok: false, error: yuk }, { status: 400 });
  return rpc(ctx.env, nom, { p_actor_id: a, ...yuk });
};

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const a = await actor(ctx); if (a instanceof Response) return a;
  let so: Yuk = {};
  try { so = await ctx.request.json(); } catch { return Response.json({ ok: false, error: 'Noto‘g‘ri so‘rov' }, { status: 400 }); }
  const amal = String(so.amal || '');
  const nom = YOZISH[amal];
  if (!nom) return Response.json({ ok: false, error: 'Amal ochiq emas' }, { status: 400 });
  const yuk = yozishYuki(amal, so);
  if (typeof yuk === 'string') return Response.json({ ok: false, error: yuk }, { status: 400 });
  return rpc(ctx.env, nom, { p_actor_id: a, ...yuk });
};
