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
import { roleAuthority, vakolatKeshTozala } from '../_shared/role-authority';
import { ishStoliQur, type AloqaQator, type IshJoyiQator } from '../_shared/ish-stoli';
import { katalogQur } from '../_shared/modul-katalog';

type Env = { SUPABASE_URL?: string; SUPABASE_KEY?: string; SESSIYA_KALIT: string };
type Yuk = Record<string, unknown>;
const JAVOB = { headers: { 'Cache-Control': 'no-store' } };
import { kodXeshi, sonmi, yangiKod, yozishYuki } from '../_shared/ish-joyi-yuk';

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

/** GET ?bolim=ish_stoli[&kabinet=<kompaniya>:<tomon>][&kompaniya_id=]. Yangi jadval yo'q: t2_ish_joylarim_v1 + vakolat (t2_men_v1, keshlangan) + t2_tomon_aloqalar_v1 (faqat o'qish). */
async function ishStoliJavob(ctx: EventContext<Env, string, unknown>, a: number, u: URL): Promise<Response> {
  const sess0 = cachedAuthority(ctx) ?? await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT).catch(() => null);
  const auth = sess0 ? (sess0.permissionsByCompany ? sess0 : await roleAuthority(sess0, { SUPABASE_URL: ctx.env.SUPABASE_URL!, SUPABASE_KEY: ctx.env.SUPABASE_KEY! })) : null;
  if (!auth) return Response.json({ ok: false, error: 'Vakolat aniqlanmadi' }, { status: 503, ...JAVOB });
  const joy = await rpc(ctx.env, 't2_ish_joylarim_v1', { p_actor_id: a });
  if (joy.body.ok !== true) return Response.json(joy.body, { status: joy.status, ...JAVOB });
  const ishJoylari = (Array.isArray(joy.body.ish_joylari) ? joy.body.ish_joylari : []) as IshJoyiQator[];
  // Munosabat kabinetlari (subpudratchi/buyurtmachi ko'zi): faqat tashkilotlar, ko'pi bilan 8 ta; xato bo'lsa e'tiborsiz (a'zolik kabinetlari qoladi).
  const aloqalar: Record<number, AloqaQator[]> = {};
  await Promise.all(ishJoylari.filter((j) => j.turi !== 'shaxsiy').slice(0, 8).map(async (j) => {
    const r = await rpc(ctx.env, 't2_tomon_aloqalar_v1', { p_actor_id: a, p_kompaniya_id: j.kompaniya_id }).catch(() => null);
    const l = r?.body.natija ?? r?.body.aloqalar;
    if (Array.isArray(l)) aloqalar[j.kompaniya_id] = l as AloqaQator[];
  }));
  const kid = u.searchParams.get('kompaniya_id');
  const javob = ishStoliQur({
    ishJoylari, ruxsatlar: auth.permissionsByCompany, modullarOff: auth.modullarOffByCompany, aloqalar, superadmin: auth.rol === 'superadmin',
    kabinet: u.searchParams.get('kabinet'), kompaniyaId: sonmi(kid) ? Number(kid) : null,
  });
  return Response.json(javob, { status: 200, ...JAVOB });
}
/**
 * GET ?bolim=katalog[&kompaniya_id=][&tanlov=1] — ilova uchun «Barcha modullar»: foydalanuvchi shu kompaniyada ochishi MUMKIN bo'lgan
 * HAMMA sahifa (veb yon menyu bilan bir xil filtr: ruxsat, kompaniya moduli, rol, superadmin qatlami). Yangi jadval yo'q.
 * `tanlov=1` — qo'shimcha ravishda foydalanuvchi tanlagan ilovalar (/api/modullarim) bilan toraytiradi; bo'lmasa har sahifada `tanlangan` bayrog'i.
 */
async function katalogJavob(ctx: EventContext<Env, string, unknown>, a: number, u: URL): Promise<Response> {
  const sess0 = cachedAuthority(ctx) ?? await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT).catch(() => null);
  const auth = sess0 ? (sess0.permissionsByCompany ? sess0 : await roleAuthority(sess0, { SUPABASE_URL: ctx.env.SUPABASE_URL!, SUPABASE_KEY: ctx.env.SUPABASE_KEY! })) : null;
  if (!auth) return Response.json({ ok: false, error: 'Vakolat aniqlanmadi' }, { status: 503, ...JAVOB });
  const q = u.searchParams.get('kompaniya_id');
  const kid = sonmi(q) ? Number(q) : null;
  const azo = kid == null ? undefined : auth.kompaniyalar?.find((x) => x.kompaniya_id === kid);
  const superadmin = auth.rol === 'superadmin';
  if (kid != null && !azo && !superadmin) return Response.json({ ok: false, code: 'RUXSAT_YOQ', error: 'Bu ish joyiga a’zo emassiz' }, { status: 403, ...JAVOB });
  let tanlangan: string[] | null = null;
  if (kid != null) {
    // Ixtiyoriy: tanlov migratsiyasi hali qo'llanmagan bo'lsa jim o'tamiz (katalog baribir to'liq).
    const t = await rpc(ctx.env, 't2_modul_tanlov_oqi_v1', { p_actor_id: a, p_kompaniya_id: kid }).catch(() => null);
    if (t && t.body.ok === true && Array.isArray(t.body.tanlangan)) tanlangan = (t.body.tanlangan as unknown[]).filter((x): x is string => typeof x === 'string');
  }
  const javob = katalogQur({
    superadmin, rol: azo?.rol ?? (superadmin ? 'superadmin' : ''),
    permissions: kid == null ? null : (auth.permissionsByCompany?.[kid] ?? null),
    modullarOff: kid == null ? [] : (auth.modullarOffByCompany?.[kid] ?? []),
    tanlangan, kompaniyaId: kid,
  });
  if (u.searchParams.get('tanlov') === '1' && tanlangan && tanlangan.length) javob.sahifalar = javob.sahifalar.filter((s) => s.tanlangan);
  return Response.json(javob, { status: 200, ...JAVOB });
}
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const a = await actor(ctx); if (a instanceof Response) return a;
  const u = new URL(ctx.request.url);
  if (u.searchParams.get('bolim') === 'katalog') return katalogJavob(ctx, a, u);
  // Markaz: barcha ish joylari + barcha joylardan «Mening ishlarim» (faqat o'z a'zoliklari, ruxsatiga qarab — bazada).
  if (u.searchParams.get('bolim') === 'joylarim') {
    const r = await rpc(ctx.env, 't2_ish_joylarim_v1', { p_actor_id: a });
    return Response.json(r.body, { status: r.status, ...JAVOB });
  }
  // Ish stoli (server-driven, rolga mos): kabinetlar + tanlangan kabinet uchun bo'limlar/amallar. Ruxsat serverda hisoblanadi.
  if (u.searchParams.get('bolim') === 'ish_stoli') return ishStoliJavob(ctx, a, u);
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
