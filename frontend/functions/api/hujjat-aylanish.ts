/**
 * hujjat-aylanish.ts — HUJJAT AYLANISHI shlyuzi: tasdiq zanjiri, xat reestri, kiruvchi quti, bildirishnomalar.
 * Dizayn: docs/architecture/HUJJAT_AYLANISH_LOGISTIKA_V1.md.
 *
 * /api/tomon kabi: ixtiyoriy jadval/RPC nomi qabul qilinmaydi (faqat quyidagi ro'yxat), actor HAR DOIM sessiyadan,
 * a'zolik/rol/aloqa tekshiruvi BAZADA (RPC birinchi qatori). Shlyuz ruxsat bermaydi — faqat tekshirilgan parametrlarni uzatadi.
 */
import { cachedAuthority } from '../_shared/permission-policy';
import { tekshir } from '../_shared/auth';
import { supabaseBaseUrl } from '../_shared/supabase-url';

type Env = { SUPABASE_URL?: string; SUPABASE_KEY?: string; SESSIYA_KALIT: string };
type Yuk = Record<string, unknown>;

export const OQISH: Record<string, string> = {
  kiruvchi: 't2_hujjat_kiruvchi_v1',
  zanjirlar: 't2_hujjat_zanjir_royxat_v1',
  zanjir: 't2_hujjat_zanjir_tafsilot_v1',
  xatlar: 't2_xat_royxat_v1',
  xat: 't2_xat_tafsilot_v1',
  bildirishnomalar: 't2_bildirishnomalar_v1',
};
export const YOZISH: Record<string, string> = {
  zanjir_yarat: 't2_hujjat_zanjir_yarat_v1',
  zanjir_qaror: 't2_hujjat_zanjir_qaror_v1',
  zanjir_qayta: 't2_hujjat_zanjir_qayta_v1',
  zanjir_bekor: 't2_hujjat_zanjir_bekor_v1',
  xat_yubor: 't2_xat_yubor_v1',
  xat_qabul: 't2_xat_qabul_v1',
  bildirishnoma_oqildi: 't2_bildirishnoma_oqildi_v1',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KALIT = /^[a-z][a-z0-9_]{1,40}$/;
const SANA = /^\d{4}-\d{2}-\d{2}$/;
const XAT_TURLARI = ['xat', 'soprovod', 'talabnoma', 'ogohlantirish', 'javob_xati', 'boshqa'];
const sonmi = (v: unknown) => v != null && v !== '' && Number.isSafeInteger(Number(v)) && Number(v) > 0;
const ixtSon = (v: unknown) => (sonmi(v) ? Number(v) : null);
const matn = (v: unknown, n: number) => (v == null || String(v).trim() === '' ? null : String(v).trim().slice(0, n));
const opId = (v: unknown) => (typeof v === 'string' && UUID.test(v) ? v : crypto.randomUUID());
const ixtSana = (v: unknown): string | null | 'xato' => (v == null || v === '' ? null : SANA.test(String(v)) ? String(v) : 'xato');

/** Zanjir qadamlari: 1–8 ta, har birida kompaniya_id va rol; muddat ixtiyoriy (YYYY-MM-DD). */
export function qadamlarniTozala(v: unknown): Yuk[] | string {
  if (!Array.isArray(v) || v.length < 1 || v.length > 8) return 'qadamlar: 1–8 ta element kerak';
  const out: Yuk[] = [];
  for (const e of v as Array<Record<string, unknown>>) {
    if (!e || typeof e !== 'object' || !sonmi(e.kompaniya_id)) return 'Har qadamda kompaniya_id kerak';
    const rol = matn(e.rol, 40);
    if (!rol || rol.length < 2) return 'Har qadamda rol kerak (2–40 belgi)';
    const muddat = ixtSana(e.muddat);
    if (muddat === 'xato') return 'muddat YYYY-MM-DD bo‘lishi kerak';
    out.push({ kompaniya_id: Number(e.kompaniya_id), rol, ...(muddat ? { muddat } : {}) });
  }
  return out;
}

export function yozishYuki(amal: string, so: Yuk): Yuk | string {
  if (amal === 'bildirishnoma_oqildi') {
    const idlar = Array.isArray(so.idlar) ? (so.idlar as unknown[]) : [];
    if (idlar.length < 1 || idlar.length > 500 || !idlar.every(sonmi)) return 'idlar: 1–500 ta musbat son';
    return { p_idlar: idlar.map(Number) };
  }
  if (!sonmi(so.kompaniya_id)) return 'kompaniya_id kerak';
  const p_kompaniya_id = Number(so.kompaniya_id);
  switch (amal) {
    case 'zanjir_yarat': {
      if (!KALIT.test(String(so.hujjat_turi ?? ''))) return 'hujjat_turi kerak (kichik lotin, 2–41 belgi)';
      const sarlavha = matn(so.sarlavha, 200);
      if (!sarlavha || sarlavha.length < 3) return 'Sarlavha kamida 3 belgi';
      const q = qadamlarniTozala(so.qadamlar);
      if (typeof q === 'string') return q;
      const mj = so.manba_jadval == null || so.manba_jadval === '' ? null : String(so.manba_jadval);
      if (mj != null && !/^t2_[a-z0-9_]+$/.test(mj)) return 'manba_jadval noto‘g‘ri';
      return { p_kompaniya_id, p_hujjat_turi: String(so.hujjat_turi), p_sarlavha: sarlavha, p_obyekt_id: ixtSon(so.obyekt_id), p_document_id: ixtSon(so.document_id),
               p_manba_jadval: mj, p_manba_id: ixtSon(so.manba_id), p_qadamlar: q, p_operation_id: opId(so.operation_id) };
    }
    case 'zanjir_qaror':
      if (!sonmi(so.zanjir_id) || !['tasdiqlash', 'rad', 'qaytarish'].includes(String(so.qaror))) return 'zanjir_id va qaror (tasdiqlash/rad/qaytarish) kerak';
      return { p_kompaniya_id, p_zanjir_id: Number(so.zanjir_id), p_qaror: String(so.qaror), p_izoh: matn(so.izoh, 2000) };
    case 'zanjir_qayta':
      if (!sonmi(so.zanjir_id)) return 'zanjir_id kerak';
      return { p_kompaniya_id, p_zanjir_id: Number(so.zanjir_id), p_izoh: matn(so.izoh, 2000), p_document_id: ixtSon(so.document_id) };
    case 'zanjir_bekor':
      if (!sonmi(so.zanjir_id)) return 'zanjir_id kerak';
      return { p_kompaniya_id, p_zanjir_id: Number(so.zanjir_id), p_sabab: matn(so.sabab, 500) };
    case 'xat_yubor': {
      if (!sonmi(so.qabul_kompaniya_id)) return 'qabul_kompaniya_id kerak';
      const turi = so.turi == null || so.turi === '' ? 'xat' : String(so.turi);
      if (!XAT_TURLARI.includes(turi)) return 'turi: ' + XAT_TURLARI.join(' | ');
      const mavzu = matn(so.mavzu, 200);
      if (!mavzu || mavzu.length < 3) return 'Mavzu kamida 3 belgi';
      const muddat = ixtSana(so.javob_muddati);
      if (muddat === 'xato') return 'javob_muddati YYYY-MM-DD bo‘lishi kerak';
      return { p_kompaniya_id, p_qabul_kompaniya_id: Number(so.qabul_kompaniya_id), p_turi: turi, p_mavzu: mavzu, p_matn: matn(so.matn, 4000), p_javob_muddati: muddat,
               p_obyekt_id: ixtSon(so.obyekt_id), p_document_id: ixtSon(so.document_id), p_ota_xat_id: ixtSon(so.ota_xat_id), p_operation_id: opId(so.operation_id) };
    }
    case 'xat_qabul':
      if (!sonmi(so.xat_id)) return 'xat_id kerak';
      return { p_kompaniya_id, p_xat_id: Number(so.xat_id) };
    default: return 'Amal ochiq emas';
  }
}

export function oqishYuki(bolim: string, q: URLSearchParams): Yuk | string {
  if (bolim === 'bildirishnomalar') {
    return { p_faqat_oqilmagan: q.get('oqilmagan') === '1', p_limit: ixtSon(q.get('limit')) ?? 50, p_keyin_id: ixtSon(q.get('keyin_id')) };
  }
  const k = q.get('kompaniya_id');
  if (!sonmi(k)) return 'kompaniya_id kerak';
  const p_kompaniya_id = Number(k);
  const lim = ixtSon(q.get('limit')) ?? 100;
  const holat = q.get('holat');
  const h = holat && /^[a-z_]{3,20}$/.test(holat) ? holat : null;
  switch (bolim) {
    case 'kiruvchi': return { p_kompaniya_id };
    case 'zanjir': return sonmi(q.get('zanjir_id')) ? { p_kompaniya_id, p_zanjir_id: Number(q.get('zanjir_id')) } : 'zanjir_id kerak';
    case 'xat': return sonmi(q.get('xat_id')) ? { p_kompaniya_id, p_xat_id: Number(q.get('xat_id')) } : 'xat_id kerak';
    case 'zanjirlar': { const y = q.get('yonalish'); return { p_kompaniya_id, p_yonalish: y === 'menga' || y === 'mendan' ? y : null, p_holat: h, p_limit: lim }; }
    case 'xatlar': { const y = q.get('yonalish'); return { p_kompaniya_id, p_yonalish: y === 'kiruvchi' || y === 'chiquvchi' ? y : null, p_holat: h, p_limit: lim }; }
    default: return 'Bo‘lim ochiq emas';
  }
}

const JAVOB = { headers: { 'Cache-Control': 'no-store' } };

/** PostgREST xatosini tushunarli javobga aylantiradi (ichki matn sizdirilmaydi). */
export function xatoJavobi(text: string): { status: number; body: Yuk } {
  let code = ''; let msg = '';
  try { const j = JSON.parse(text) as { code?: string; message?: string }; code = j.code ?? ''; msg = j.message ?? ''; } catch { /* matn emas */ }
  if (code === '42501') {
    if (/HUJJAT_ROL_YETARLI_EMAS/.test(msg)) return { status: 403, body: { ok: false, code: 'ROL_YETARLI_EMAS', error: 'Sizning rolingiz bu amal uchun yetarli emas' } };
    return { status: 403, body: { ok: false, code: 'AZO_EMAS', error: 'Siz bu kompaniyaning faol a’zosi emassiz' } };
  }
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
