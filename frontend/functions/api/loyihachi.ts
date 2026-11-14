/**
 * loyihachi.ts — LOYIHACHI / MUALLIFLIK NAZORATI shlyuzi: chizma reyestri, revizyalar, smeta o'zgarish takliflari, rol uyi «Bugun».
 *
 * /api/tomon kabi: ixtiyoriy jadval/RPC nomi qabul qilinmaydi (faqat quyidagi ro'yxat), actor HAR DOIM sessiyadan,
 * a'zolik/capability (design.*, document.write) va aloqa/taqdim tekshiruvi BAZADA (RPC birinchi qatorlari).
 * RFI (savol) va mualliflik remarki — mavjud /api/tomon murojaat oqimi (turi `savol` / `mualliflik_remark`), bu yerda takrorlanmaydi.
 */
import { cachedAuthority } from '../_shared/permission-policy';
import { tekshir } from '../_shared/auth';
import { supabaseBaseUrl } from '../_shared/supabase-url';

type Env = { SUPABASE_URL?: string; SUPABASE_KEY?: string; SESSIYA_KALIT: string };
type Yuk = Record<string, unknown>;

export const OQISH: Record<string, string> = {
  royxat: 't2_chizma_royxat_v1',
  takliflar: 't2_chizma_taklif_royxat_v1',
  taasir: 't2_chizma_taasir_v1',
  bugun: 't2_loyihachi_bugun_v1',
};
export const YOZISH: Record<string, string> = {
  toplam_saqla: 't2_chizma_toplam_saqla_v1',
  revizya_yarat: 't2_chizma_revizya_yarat_v1',
  revizya_tahrir: 't2_chizma_revizya_tahrir_v1',
  taklif_yoz: 't2_chizma_taklif_yoz_v1',
  chiqar: 't2_chizma_chiqar_v1',
  bekor: 't2_chizma_bekor_v1',
  qaror: 't2_chizma_qaror_v1',
  boglash: 't2_chizma_boglash_v1',
  taklif_pto: 't2_chizma_taklif_pto_v1',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sonmi = (v: unknown) => v != null && v !== '' && Number.isSafeInteger(Number(v)) && Number(v) > 0;
const nolSon = (v: unknown) => v != null && v !== '' && Number.isSafeInteger(Number(v)) && Number(v) >= 0;
const ixtSon = (v: unknown) => (sonmi(v) ? Number(v) : null);
const matn = (v: unknown, n: number) => (v == null || String(v).trim() === '' ? null : String(v).trim().slice(0, n));
const opId = (v: unknown) => (typeof v === 'string' && UUID.test(v) ? v : crypto.randomUUID());
const TAKLIF_TURLARI = ['qoshimcha', 'zamena', 'olib_tashlash', 'hajm'];

/** Yozish amalini RPC yukiga aylantiradi (xato bo'lsa — matn). */
export function yozishYuki(amal: string, so: Yuk): Yuk | string {
  if (!sonmi(so.kompaniya_id)) return 'kompaniya_id kerak';
  const p_kompaniya_id = Number(so.kompaniya_id);
  switch (amal) {
    case 'toplam_saqla':
      if (!sonmi(so.aloqa_id) || !sonmi(so.obyekt_id)) return 'aloqa_id va obyekt_id kerak';
      if (!['PD', 'RD'].includes(String(so.bosqich))) return 'bosqich: PD yoki RD';
      if (!matn(so.marka, 20) || !matn(so.varaq, 40)) return 'Marka va varaq raqami kerak';
      return { p_kompaniya_id, p_aloqa_id: Number(so.aloqa_id), p_obyekt_id: Number(so.obyekt_id), p_bosqich: String(so.bosqich), p_marka: matn(so.marka, 20), p_varaq: matn(so.varaq, 40),
               p_nom: matn(so.nom, 300), p_operation_id: opId(so.operation_id) };
    case 'revizya_yarat':
      if (!sonmi(so.toplam_id)) return 'toplam_id kerak';
      return { p_kompaniya_id, p_toplam_id: Number(so.toplam_id), p_document_id: ixtSon(so.document_id), p_ozgarish_izohi: matn(so.ozgarish_izohi, 2000), p_taasir_izoh: matn(so.taasir_izoh, 2000),
               p_operation_id: opId(so.operation_id) };
    case 'revizya_tahrir':
      if (!sonmi(so.revizya_id)) return 'revizya_id kerak';
      return { p_kompaniya_id, p_revizya_id: Number(so.revizya_id), p_document_id: ixtSon(so.document_id), p_ozgarish_izohi: matn(so.ozgarish_izohi, 2000), p_taasir_izoh: matn(so.taasir_izoh, 2000) };
    case 'taklif_yoz': {
      if (!sonmi(so.revizya_id) || !TAKLIF_TURLARI.includes(String(so.tur))) return 'revizya_id va tur (qoshimcha/zamena/olib_tashlash/hajm) kerak';
      const nom = matn(so.nom, 300);
      if (!nom || nom.length < 2) return 'Ish nomi kerak';
      const hajm = so.hajm == null || so.hajm === '' ? null : Number(so.hajm);
      if (hajm != null && (!Number.isFinite(hajm) || hajm < 0)) return 'hajm manfiy bo‘lmasligi kerak';
      return { p_kompaniya_id, p_revizya_id: Number(so.revizya_id), p_tur: String(so.tur), p_nom: nom, p_birlik: matn(so.birlik, 20), p_hajm: hajm, p_izoh: matn(so.izoh, 1000) };
    }
    case 'chiqar': {
      if (!sonmi(so.revizya_id)) return 'revizya_id kerak';
      const idlar = Array.isArray(so.aloqa_idlar) ? (so.aloqa_idlar as unknown[]) : [];
      if (idlar.length > 10 || !idlar.every(sonmi)) return 'aloqa_idlar: ko‘pi bilan 10 ta musbat son';
      return { p_kompaniya_id, p_revizya_id: Number(so.revizya_id), p_aloqa_idlar: idlar.map(Number), p_izoh: matn(so.izoh, 1000) };
    }
    case 'bekor':
      if (!sonmi(so.revizya_id)) return 'revizya_id kerak';
      return { p_kompaniya_id, p_revizya_id: Number(so.revizya_id), p_sabab: matn(so.sabab, 1000) };
    case 'qaror':
      if (!sonmi(so.taqdim_id) || !['korilmoqda', 'qabul', 'rad', 'tuzatish'].includes(String(so.qaror))) return 'taqdim_id va qaror (korilmoqda/qabul/rad/tuzatish) kerak';
      return { p_kompaniya_id, p_taqdim_id: Number(so.taqdim_id), p_qaror: String(so.qaror), p_izoh: matn(so.izoh, 2000) };
    case 'boglash':
      if (!sonmi(so.toplam_id) || !sonmi(so.obyekt_id) || !nolSon(so.revizya)) return 'toplam_id, obyekt_id va revizya kerak';
      if ((sonmi(so.qator_id) ? 1 : 0) + (sonmi(so.aosr_id) ? 1 : 0) !== 1) return 'Aynan bittasini tanlang: qator_id yoki aosr_id';
      if (!['qosh', 'ochir'].includes(String(so.harakat))) return 'harakat: qosh | ochir';
      return { p_kompaniya_id, p_toplam_id: Number(so.toplam_id), p_revizya: Number(so.revizya), p_obyekt_id: Number(so.obyekt_id), p_qator_id: ixtSon(so.qator_id), p_aosr_id: ixtSon(so.aosr_id),
               p_amal: String(so.harakat) };
    case 'taklif_pto':
      if (!sonmi(so.taklif_id) || !['ozgarishga', 'rad'].includes(String(so.qaror))) return 'taklif_id va qaror (ozgarishga/rad) kerak';
      if (so.qaror === 'ozgarishga' && !sonmi(so.obyekt_id)) return 'obyekt_id kerak';
      return { p_kompaniya_id, p_taklif_id: Number(so.taklif_id), p_qaror: String(so.qaror), p_obyekt_id: ixtSon(so.obyekt_id), p_qator_id: ixtSon(so.qator_id), p_izoh: matn(so.izoh, 1000),
               p_operation_id: opId(so.operation_id) };
    default: return 'Amal ochiq emas';
  }
}

/** O'qish bo'limini RPC yukiga aylantiradi. */
export function oqishYuki(bolim: string, q: URLSearchParams): Yuk | string {
  const k = q.get('kompaniya_id');
  if (!sonmi(k)) return 'kompaniya_id kerak';
  const p_kompaniya_id = Number(k);
  switch (bolim) {
    case 'bugun': return { p_kompaniya_id };
    case 'royxat': case 'taasir': return { p_kompaniya_id, p_obyekt_id: ixtSon(q.get('obyekt_id')) };
    case 'takliflar': return sonmi(q.get('revizya_id')) ? { p_kompaniya_id, p_revizya_id: Number(q.get('revizya_id')) } : 'revizya_id kerak';
    default: return 'Bo‘lim ochiq emas';
  }
}

const JAVOB = { headers: { 'Cache-Control': 'no-store' } };

/** PostgREST xatosini foydalanuvchiga tushunarli javobga aylantiradi (ichki matn sizdirilmaydi). */
export function xatoJavobi(text: string): { status: number; body: Yuk } {
  let code = ''; let msg = '';
  try { const j = JSON.parse(text) as { code?: string; message?: string }; code = j.code ?? ''; msg = j.message ?? ''; } catch { /* matn emas */ }
  if (code === '42501') {
    if (/PERMISSION_DENIED|TOMON_ROL_YETARLI_EMAS/.test(msg)) return { status: 403, body: { ok: false, code: 'RUXSAT_YETARLI_EMAS', error: 'Sizning rolingiz bu amal uchun yetarli emas' } };
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
