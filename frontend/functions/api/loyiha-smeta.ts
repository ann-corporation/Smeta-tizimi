/**
 * loyiha-smeta.ts — LOYIHA <-> SMETA <-> FAKT solishtirma shlyuzi.
 * /api/loyihachi kabi: ixtiyoriy jadval/RPC nomi qabul qilinmaydi (faqat quyidagi ro'yxat), actor HAR DOIM sessiyadan,
 * a'zolik va smeta.read / smeta.write bazada (RPC birinchi qatorlari). Asl smeta (t2_qator) bu shlyuz orqali o'zgarmaydi.
 */
import { cachedAuthority } from '../_shared/permission-policy';
import { tekshir } from '../_shared/auth';
import { supabaseBaseUrl } from '../_shared/supabase-url';

type Env = { SUPABASE_URL?: string; SUPABASE_KEY?: string; SESSIYA_KALIT: string };
type Yuk = Record<string, unknown>;

export const OQISH: Record<string, string> = {
  royxat: 't2_loyiha_royxat_v1',
  farq: 't2_loyiha_farq_v1',
  smeta: 't2_loyiha_smeta_v1',
  xarita: 't2_loyiha_xarita_v1',
  tahrir_royxat: 't2_loyiha_tahrir_royxat_v1',
  tahrir_farq: 't2_loyiha_tahrir_farq_v1',
};
export const YOZISH: Record<string, string> = {
  yoz: 't2_loyiha_yoz_v1',
  tasdiq: 't2_loyiha_tasdiq_v1',
  boglash: 't2_loyiha_boglash_v1',
  qaror: 't2_loyiha_qaror_v1',
  xarita: 't2_loyiha_xarita_yoz_v1',
  tahrir_yarat: 't2_loyiha_tahrir_yarat_v1',
  tahrir_yoz: 't2_loyiha_tahrir_yoz_v1',
  tahrir_asos: 't2_loyiha_tahrir_asos_v1',
  tahrir_qaror: 't2_loyiha_tahrir_qaror_v1',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sonmi = (v: unknown) => v != null && v !== '' && Number.isSafeInteger(Number(v)) && Number(v) > 0;
const ixtSon = (v: unknown) => (sonmi(v) ? Number(v) : null);
const matn = (v: unknown, n: number) => (v == null || String(v).trim() === '' ? null : String(v).trim().slice(0, n));
const opId = (v: unknown) => (typeof v === 'string' && UUID.test(v) ? v : crypto.randomUUID());
const TURLAR = ['beton', 'armatura', 'pardoz', 'eshik_oyna', 'uskuna', 'boshqa'];
const QAROR_TURLARI = ['boglandi', 'zamena', 'qoshimcha', 'pereraschet', 'etibor_yoq'];
const ixtMiqdor = (v: unknown): number | null | undefined => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

/** Bitta element tozalanadi: noma'lum miqdor null qoladi (0 ga aylantirilmaydi). */
export function elementTozala(x: unknown): Yuk | null {
  if (!x || typeof x !== 'object') return null;
  const e = x as Yuk;
  const nom = matn(e.nom, 300); const birlik = matn(e.birlik, 20);
  const miqdor = ixtMiqdor(e.miqdor);
  if (!nom || !birlik || miqdor === undefined) return null;
  const ish = e.ishonch == null || e.ishonch === '' ? null : Number(e.ishonch);
  return {
    nom, birlik, miqdor, belgi: matn(e.belgi, 60), tur: TURLAR.includes(String(e.tur)) ? String(e.tur) : 'boshqa',
    manba_r2: matn(e.manba_r2, 300), manba_sahifa: ixtSon(e.manba_sahifa), manba_ref: matn(e.manba_ref, 200),
    ishonch: ish != null && Number.isFinite(ish) && ish >= 0 && ish <= 1 ? ish : null,
  };
}

export function yozishYuki(amal: string, so: Yuk): Yuk | string {
  if (!sonmi(so.kompaniya_id)) return 'kompaniya_id kerak';
  const p_kompaniya_id = Number(so.kompaniya_id);
  switch (amal) {
    case 'yoz': {
      if (!sonmi(so.obyekt_id) || !matn(so.varaq, 40)) return 'obyekt_id va varaq kerak';
      const rev = Number(so.revizya ?? 0);
      if (!Number.isInteger(rev) || rev < 0 || rev > 99) return 'revizya 0..99';
      if (!Array.isArray(so.items) || so.items.length === 0 || so.items.length > 2000) return 'items: 1..2000 ta';
      const items = so.items.map(elementTozala);
      if (items.some((i) => i == null)) return 'Har elementda nom, birlik va to‘g‘ri miqdor kerak';
      return { p_kompaniya_id, p_obyekt_id: Number(so.obyekt_id), p_varaq: matn(so.varaq, 40), p_revizya: rev, p_toplam_id: ixtSon(so.toplam_id), p_items: items, p_operation_id: opId(so.operation_id) };
    }
    case 'tasdiq': {
      const idlar = Array.isArray(so.ids) ? (so.ids as unknown[]) : [];
      if (idlar.length === 0 || idlar.length > 2000 || !idlar.every(sonmi)) return 'ids: 1..2000 ta musbat son';
      if (!['tasdiqlangan', 'rad', 'taklif'].includes(String(so.holat))) return 'holat: tasdiqlangan | rad | taklif';
      return { p_kompaniya_id, p_ids: idlar.map(Number), p_holat: String(so.holat) };
    }
    case 'boglash':
      if (!sonmi(so.miqdor_id) || !sonmi(so.qator_id)) return 'miqdor_id va qator_id kerak';
      if (!['qosh', 'ochir'].includes(String(so.harakat))) return 'harakat: qosh | ochir';
      return { p_kompaniya_id, p_miqdor_id: Number(so.miqdor_id), p_qator_id: Number(so.qator_id), p_ball: so.ball == null ? null : Math.max(0, Math.min(1, Number(so.ball) || 0)),
               p_sabab: matn(so.sabab, 300), p_amal: String(so.harakat) };
    case 'qaror':
      if (!sonmi(so.miqdor_id) || !QAROR_TURLARI.includes(String(so.tur))) return 'miqdor_id va tur (boglandi/zamena/qoshimcha/pereraschet/etibor_yoq) kerak';
      return { p_kompaniya_id, p_miqdor_id: Number(so.miqdor_id), p_tur: String(so.tur), p_qator_id: ixtSon(so.qator_id), p_ref_jadval: matn(so.ref_jadval, 60), p_ref_id: ixtSon(so.ref_id),
               p_sabab: matn(so.sabab, 500) };
    case 'xarita':
      if (!sonmi(so.obyekt_id) || !sonmi(so.bolim_qator_id) || !matn(so.varaq, 40)) return 'obyekt_id, varaq va bolim_qator_id kerak';
      if (!['qosh', 'ochir'].includes(String(so.harakat))) return 'harakat: qosh | ochir';
      return { p_kompaniya_id, p_obyekt_id: Number(so.obyekt_id), p_varaq: matn(so.varaq, 40), p_bolim_qator_id: Number(so.bolim_qator_id), p_manba: so.manba === 'taklif' ? 'taklif' : 'qolda', p_sabab: matn(so.sabab, 300), p_amal: String(so.harakat) };
    case 'tahrir_yarat': {
      const nom = matn(so.nom, 80); if (!sonmi(so.obyekt_id) || !nom) return 'obyekt_id va nom kerak';
      const sana = typeof so.sana === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(so.sana) ? so.sana : null;
      return { p_kompaniya_id, p_obyekt_id: Number(so.obyekt_id), p_nom: nom, p_sana: sana };
    }
    case 'tahrir_yoz': {
      if (!sonmi(so.obyekt_id) || !sonmi(so.tahrir_id) || !matn(so.varaq, 40)) return 'obyekt_id, tahrir_id va varaq kerak';
      const rev = Number(so.revizya ?? 0); if (!Number.isInteger(rev) || rev < 0 || rev > 99) return 'revizya 0..99';
      if (!Array.isArray(so.items) || so.items.length === 0 || so.items.length > 2000) return 'items: 1..2000 ta';
      const items = so.items.map(elementTozala); if (items.some((i) => i == null)) return 'Har elementda nom, birlik va to‘g‘ri miqdor kerak';
      return { p_kompaniya_id, p_obyekt_id: Number(so.obyekt_id), p_tahrir_id: Number(so.tahrir_id), p_varaq: matn(so.varaq, 40), p_revizya: rev, p_toplam_id: ixtSon(so.toplam_id), p_items: items, p_operation_id: opId(so.operation_id) };
    }
    case 'tahrir_asos':
      if (!sonmi(so.obyekt_id) || !sonmi(so.tahrir_id)) return 'obyekt_id va tahrir_id kerak';
      return { p_kompaniya_id, p_obyekt_id: Number(so.obyekt_id), p_tahrir_id: Number(so.tahrir_id) };
    case 'tahrir_qaror':
      if (!sonmi(so.obyekt_id) || !sonmi(so.eski_id) || !sonmi(so.yangi_id) || !matn(so.varaq, 40) || !matn(so.kalit, 400)) return 'obyekt_id, eski_id, yangi_id, varaq va kalit kerak';
      if (!['smetaga_kochir', 'pereraschet', 'qoldir'].includes(String(so.qaror))) return 'qaror: smetaga_kochir | pereraschet | qoldir';
      return { p_kompaniya_id, p_obyekt_id: Number(so.obyekt_id), p_eski: Number(so.eski_id), p_yangi: Number(so.yangi_id), p_varaq: matn(so.varaq, 40), p_kalit: matn(so.kalit, 400), p_qaror: String(so.qaror), p_sabab: matn(so.sabab, 500) };
    default: return 'Amal ochiq emas';
  }
}

export function oqishYuki(bolim: string, q: URLSearchParams): Yuk | string {
  if (!OQISH[bolim]) return 'Bo‘lim ochiq emas';
  if (!sonmi(q.get('kompaniya_id')) || !sonmi(q.get('obyekt_id'))) return 'kompaniya_id va obyekt_id kerak';
  if (bolim === 'tahrir_farq') {
    if (!sonmi(q.get('eski_id')) || !sonmi(q.get('yangi_id'))) return 'eski_id va yangi_id kerak';
    return { p_kompaniya_id: Number(q.get('kompaniya_id')), p_obyekt_id: Number(q.get('obyekt_id')), p_eski: Number(q.get('eski_id')), p_yangi: Number(q.get('yangi_id')) };
  }
  return { p_kompaniya_id: Number(q.get('kompaniya_id')), p_obyekt_id: Number(q.get('obyekt_id')) };
}

const JAVOB = { headers: { 'Cache-Control': 'no-store' } };

export function xatoJavobi(text: string): { status: number; body: Yuk } {
  let code = '';
  try { code = (JSON.parse(text) as { code?: string }).code ?? ''; } catch { /* matn emas */ }
  if (code === '42501') return { status: 403, body: { ok: false, code: 'AZO_EMAS', error: 'Ruxsat yo‘q: faol a’zo emassiz yoki rolingiz yetarli emas' } };
  if (code === '22023') return { status: 400, body: { ok: false, error: 'Noto‘g‘ri so‘rov' } };
  return { status: 502, body: { ok: false, error: 'Server xatosi' } };
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
  const u = new URL(ctx.request.url);
  const bolim = u.searchParams.get('bolim') || '';
  const yuk = oqishYuki(bolim, u.searchParams);
  if (typeof yuk === 'string') return Response.json({ ok: false, error: yuk }, { status: 400 });
  return rpc(ctx.env, OQISH[bolim], { p_actor_id: a, ...yuk });
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
