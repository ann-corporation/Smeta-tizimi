/**
 * ish-joyi.ts — ISH JOYLARI shlyuzi («Telegram modeli», egasi 2026-10-22; ARXITEKTURA_TELEGRAM_MODELI T1–T3).
 *
 *   GET  ?bolim=takliflar&kompaniya_id=  — ish joyining taklif havolalari (a'zo boshqaruvi huquqi bilan)
 *   POST { amal: 'yarat', nom, turi }                             — yangi ish joyi darhol (tasdiqsiz)
 *   POST { amal: 'turi', kompaniya_id, turi }                    — shaxsiy ↔ tashkilot
 *   POST { amal: 'taklif_yarat', kompaniya_id, rol, muddat_soat, max_soni, izoh } — havola; ochiq kod BIR MARTA qaytadi
 *   POST { amal: 'taklif_bekor', kompaniya_id, taklif_id }
 *   POST { amal: 'qoshil', kod }                                 — havola orqali qo'shilish (hali a'zo emas — shuning uchun
 *                                                                  bu API middleware ruxsat ro'yxatida emas; tekshiruv BAZADA)
 * Actor HAR DOIM sessiyadan. A'zolik, ruxsat, cheklov va muddat tekshiruvi — RPC ichida. Bazaga faqat kod xeshi boradi.
 */
import { cachedAuthority } from '../_shared/permission-policy';
import { tekshir } from '../_shared/auth';
import { supabaseBaseUrl } from '../_shared/supabase-url';
import { vakolatKeshTozala } from '../_shared/role-authority';

type Env = { SUPABASE_URL?: string; SUPABASE_KEY?: string; SESSIYA_KALIT: string };
type Yuk = Record<string, unknown>;
const JAVOB = { headers: { 'Cache-Control': 'no-store' } };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sonmi = (v: unknown) => v != null && v !== '' && Number.isSafeInteger(Number(v)) && Number(v) > 0;
const opId = (v: unknown) => (typeof v === 'string' && UUID.test(v) ? v : crypto.randomUUID());
export const TAKLIF_ROLLARI = ['rahbar', 'bugalter', 'pto', 'prorab', 'buyurtmachi', 'pudratchi', 'kuzatuvchi'] as const;

/** Ochiq kod alifbosi: o'xshash belgilarsiz (0/O, 1/I/L yo'q). */
const KOD_ALIFBO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function yangiKod(): string {
  const b = new Uint8Array(15);
  crypto.getRandomValues(b);
  let s = '';
  for (const x of b) s += KOD_ALIFBO[x % KOD_ALIFBO.length];
  return `${s.slice(0, 5)}-${s.slice(5, 10)}-${s.slice(10, 15)}`;
}
const kodTozala = (k: string) => k.toUpperCase().replace(/[^A-Z0-9]/g, '');
/** Tomon kodlaridan ajratilgan tuz («ish-joyi-taklif:») — bir tur kod boshqasida ishlamaydi. */
export async function kodXeshi(kod: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('ish-joyi-taklif:' + kodTozala(kod)));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Yozish so'rovini RPC nomi + yukiga aylantiradi (xato bo'lsa — matn). Kod xeshi alohida (async). */
export function yozishYuki(amal: string, so: Yuk): { rpc: string; yuk: Yuk } | string {
  const turi = String(so.turi ?? '');
  switch (amal) {
    case 'yarat': {
      const nom = String(so.nom ?? '').replace(/\s+/g, ' ').trim();
      if (nom.length < 2 || nom.length > 120) return 'Ish joyi nomi 2–120 belgi bo‘lsin';
      if (turi !== 'shaxsiy' && turi !== 'tashkilot') return 'Turi: shaxsiy yoki tashkilot';
      return { rpc: 't2_ish_joyi_yarat_v1', yuk: { p_nom: nom, p_turi: turi, p_operation_id: opId(so.operation_id) } };
    }
    case 'turi':
      if (!sonmi(so.kompaniya_id)) return 'kompaniya_id kerak';
      if (turi !== 'shaxsiy' && turi !== 'tashkilot') return 'Turi: shaxsiy yoki tashkilot';
      return { rpc: 't2_ish_joyi_turi_v1', yuk: { p_kompaniya_id: Number(so.kompaniya_id), p_turi: turi } };
    case 'taklif_yarat': {
      if (!sonmi(so.kompaniya_id)) return 'kompaniya_id kerak';
      const rol = String(so.rol ?? '');
      if (!(TAKLIF_ROLLARI as readonly string[]).includes(rol)) return 'Havola orqali beriladigan rolni tanlang';
      const soat = Number(so.muddat_soat ?? 72), soni = Number(so.max_soni ?? 1);
      if (!Number.isInteger(soat) || soat < 1 || soat > 720) return 'Muddat 1 soatdan 30 kungacha';
      if (!Number.isInteger(soni) || soni < 1 || soni > 500) return 'Foydalanish soni 1–500';
      return { rpc: 't2_ish_joyi_taklif_yarat_v1', yuk: { p_kompaniya_id: Number(so.kompaniya_id), p_rol: rol, p_muddat_soat: soat, p_max_soni: soni,
        p_izoh: so.izoh == null ? null : String(so.izoh).slice(0, 200), p_operation_id: opId(so.operation_id) } };
    }
    case 'taklif_bekor':
      if (!sonmi(so.kompaniya_id) || !sonmi(so.taklif_id)) return 'kompaniya_id va taklif_id kerak';
      return { rpc: 't2_ish_joyi_taklif_bekor_v1', yuk: { p_kompaniya_id: Number(so.kompaniya_id), p_taklif_id: Number(so.taklif_id) } };
    case 'qoshil': {
      const kod = kodTozala(String(so.kod ?? ''));
      if (kod.length < 10 || kod.length > 40) return 'Taklif kodi noto‘g‘ri';
      return { rpc: 't2_ish_joyi_qoshil_v1', yuk: { p_kod: kod, p_operation_id: opId(so.operation_id) } };
    }
    default: return 'Amal ochiq emas';
  }
}

export function xatoJavobi(text: string): { status: number; body: Yuk } {
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
  if (u.searchParams.get('bolim') !== 'takliflar' || !sonmi(u.searchParams.get('kompaniya_id'))) return Response.json({ ok: false, error: 'Bo‘lim ochiq emas' }, { status: 400 });
  const r = await rpc(ctx.env, 't2_ish_joyi_takliflar_v1', { p_actor_id: a, p_kompaniya_id: Number(u.searchParams.get('kompaniya_id')) });
  return Response.json(r.body, { status: r.status, ...JAVOB });
};

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const a = await actor(ctx); if (a instanceof Response) return a;
  let so: Yuk = {};
  try { so = await ctx.request.json(); } catch { return Response.json({ ok: false, error: 'Noto‘g‘ri so‘rov' }, { status: 400 }); }
  const amal = String(so.amal || '');
  const t = yozishYuki(amal, so);
  if (typeof t === 'string') return Response.json({ ok: false, error: t }, { status: 400 });
  const yuk: Yuk = { p_actor_id: a, ...t.yuk };
  // Ochiq kod bazaga HECH QACHON bormaydi.
  let ochiqKod: string | null = null;
  if (amal === 'taklif_yarat') { ochiqKod = yangiKod(); yuk.p_kod_xesh = await kodXeshi(ochiqKod); }
  if (amal === 'qoshil') { yuk.p_kod_xesh = await kodXeshi(String(yuk.p_kod)); delete yuk.p_kod; }
  const r = await rpc(ctx.env, t.rpc, yuk);
  // Yangi a'zolik / yangi ish joyi — vakolat keshi shu foydalanuvchi uchun darhol yangilansin.
  if (r.body.ok === true && (amal === 'qoshil' || amal === 'yarat')) vakolatKeshTozala(a);
  // Kod faqat shu chaqiruvda yaratilgan bo'lsa qaytariladi (takror chaqiruvda eski kod ko'rsatilmaydi).
  const body = amal === 'taklif_yarat' && r.body.ok === true && r.body.takror !== true ? { ...r.body, kod: ochiqKod } : r.body;
  return Response.json(body, { status: r.status, ...JAVOB });
};
