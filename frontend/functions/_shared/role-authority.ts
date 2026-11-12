import { SESSIYA_MUDDAT_MS, type Sess } from './auth';
import { supabaseBaseUrl } from './supabase-url';

/** Ruxsat talabi: |b — bittasi yetarli (masalan naryad «bajarildi»: usta self.work.write YOKI prorab smeta.write). Oddiy nom — aynan shu. */
export const ruxsatBormi = (list: readonly string[] | undefined, permission: string): boolean => !!list && permission.split('|').some((p) => list.includes(p));

const WRITERS = new Set(['superadmin', 'admin', 'boss', 'pto', 'prorab', 'bugalter']);
/** All resolved target companies must authorize the write, even without a body company_id. */
export function mayWriteCompanies(sess: Sess, companyIds: readonly number[], permission?: string): boolean {
  if (!sess.kompaniyalar) return false;
  if (!companyIds.length) return sess.kompaniyalar.some(a => WRITERS.has(a.rol));
  return companyIds.every(id => sess.kompaniyalar!.some(a => a.kompaniya_id === id && (permission && sess.permissionsByCompany ? ruxsatBormi(sess.permissionsByCompany[id], permission) : WRITERS.has(a.rol))));
}

/** Egasi 2026-10-21: «PTO bo'lib kirgan bo'lsam tizim eslab qolishi yetarli — Jarvis'ga har so'rovda qayta tekshirish
 *  ortiqcha». DB vakolati (t2_men_v1) shu isolate xotirasida qisqa muddat saqlanadi. Cookie'dagi rolga ishonilmaydi —
 *  kesh faqat DB javobidan; rol olib tashlansa ko'pi bilan VAKOLAT_KESH_MS ichida kuchga kiradi. Xato javob keshlanmaydi. */
export const VAKOLAT_KESH_MS = 60_000;
type Vakolat = Pick<Sess, 'rol' | 'kompaniyalar' | 'permissionsByCompany' | 'explicitDenialsByCompany' | 'modullarOffByCompany'>;
/** `bekor` — t2_foydalanuvchi.sessiya_bekor_dan (ms). Kesh bilan birga saqlanadi, shunda keshdan o'qilganda ham amal qiladi. */
const vakolatKesh = new Map<number, { vaqt: number; qiymat: Vakolat; bekor?: number }>();
/** Soat siljishi uchun yumshatish: cookie bekor qilishdan 2 soniya oldin chiqarilgan bo'lsa ham yaroqli deb sanaladi. */
export const SESSIYA_BEKOR_TOLERANS_MS = 2000;
/** Sessiya chiqarilgan vaqt (iat) = exp − SESSIYA_MUDDAT_MS. Bekor qilish vaqtidan oldin bo'lsa — sessiya bekor. */
export function sessiyaBekorQilingan(sess: Pick<Sess, 'exp'>, bekor: number | undefined): boolean {
  if (bekor == null || !Number.isFinite(bekor)) return false;
  return sess.exp - SESSIYA_MUDDAT_MS + SESSIYA_BEKOR_TOLERANS_MS < bekor;
}
/** Sessiya ANIQ yaroqsiz (bekor qilingan yoki hisob faol emas/birlashtirilgan) — vaqtinchalik DB xatosidan farqi:
 *  bunday holatda javob 401 bo'lishi kerak (qayta kirish), 503 emas (qayta urinish). Kalit — roleAuthority'ga berilgan sess obyekti. */
const yaroqsizSessiyalar = new WeakSet<object>();
export function sessiyaYaroqsizmi(sess: object | null | undefined): boolean { return !!sess && yaroqsizSessiyalar.has(sess); }
/** Yaroqsiz sessiya uchun yagona javob: 401 + cookie tozalanadi. */
export function yaroqsizSessiyaJavob(): Response {
  return Response.json({ ok: false, code: 'SESSIYA_YAROQSIZ', error: 'Sessiya yopilgan. Tizimga qayta kiring.' },
    { status: 401, headers: { 'Set-Cookie': 'sess=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0', 'Cache-Control': 'no-store' } });
}
export function vakolatKeshTozala(foydalanuvchiId?: number) { if (foydalanuvchiId == null) vakolatKesh.clear(); else vakolatKesh.delete(foydalanuvchiId); }

/** DB authority (keshlangan, ≤60 s); signed login role is not a live permission. */
export async function roleAuthority(sess: Sess, env: { SUPABASE_URL: string; SUPABASE_KEY: string }): Promise<Sess | null> {
  if (!Number.isSafeInteger(sess.foydalanuvchi_id) || !sess.foydalanuvchi_id) return null;
  const id = sess.foydalanuvchi_id as number;
  const k = vakolatKesh.get(id);
  if (k && Date.now() - k.vaqt < VAKOLAT_KESH_MS) {
    if (sessiyaBekorQilingan(sess, k.bekor)) { yaroqsizSessiyalar.add(sess); return null; }
    return { ...sess, ...k.qiymat };
  }
  const { authority: yangi, bekor, yaroqsiz } = await roleAuthorityDb(sess, env);
  if (yaroqsiz) yaroqsizSessiyalar.add(sess);
  if (yangi) {
    if (vakolatKesh.size > 5000) vakolatKesh.clear();
    vakolatKesh.set(id, { vaqt: Date.now(), qiymat: { rol: yangi.rol, kompaniyalar: yangi.kompaniyalar, permissionsByCompany: yangi.permissionsByCompany, explicitDenialsByCompany: yangi.explicitDenialsByCompany, modullarOffByCompany: yangi.modullarOffByCompany }, bekor });
  } else vakolatKesh.delete(id);
  if (yangi && sessiyaBekorQilingan(sess, bekor)) { yaroqsizSessiyalar.add(sess); return null; }
  return yangi;
}

async function roleAuthorityDb(sess: Sess, env: { SUPABASE_URL: string; SUPABASE_KEY: string }): Promise<{ authority: Sess | null; bekor?: number; yaroqsiz?: boolean }> {
  try {
    const r = await fetch(supabaseBaseUrl(env.SUPABASE_URL) + '/rest/v1/rpc/t2_men_v1', {
      method: 'POST', headers: { apikey: env.SUPABASE_KEY, Authorization: 'Bearer ' + env.SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_actor_id: sess.foydalanuvchi_id }),
    });
    if (!r.ok) return { authority: null };
    const j = await r.json() as { ok?: boolean; platform_role?: string; foydalanuvchi?: { holat?: string; sessiya_bekor_dan?: string | null }; context_kompaniyalar?: { kompaniya_id: number; effective_role: string; permissions?: string[]; explicit_denials?: string[]; modullar_off?: string[] }[]; azoliklar?: { kompaniya_id: number; rol: string; faol?: boolean }[] };
    // Hisob bazada yo'q yoki boshqa hisobga birlashtirilgan (t2_men_v1 → ACTOR_NOT_FOUND) — cookie yaroqsiz, vaqtinchalik
    // xato emas: 401 + cookie tozalash (aks holda eski «admin» cookie'si bilan 503 «Server bilan aloqa yo'q» da qotib qoladi).
    if (!j.ok) return j && (j as { code?: string }).code === 'ACTOR_NOT_FOUND' ? { authority: null, yaroqsiz: true } : { authority: null };
    // Hisob topildi, lekin faol emas (bloklangan yoki boshqa hisobga birlashtirilgan) — vaqtinchalik xato emas.
    if (j.foydalanuvchi?.holat && j.foydalanuvchi.holat !== 'faol') return { authority: null, yaroqsiz: true };
    if (j.foydalanuvchi?.holat !== 'faol') return { authority: null };
    const bekorMs = j.foydalanuvchi?.sessiya_bekor_dan ? Date.parse(j.foydalanuvchi.sessiya_bekor_dan) : NaN; // maydon yo'q (eski DB) → NaN → cheklov yo'q
    const bekor = Number.isFinite(bekorMs) ? bekorMs : undefined;
    // Older DB response remains least-privilege: never trust cookie superadmin.
    const superadmin = j.platform_role === 'superadmin';
    const kompaniyalar = j.context_kompaniyalar?.map(k => ({ kompaniya_id: k.kompaniya_id, rol: k.effective_role }))
      ?? j.azoliklar?.filter(a => a.faol !== false).map(a => ({ kompaniya_id: a.kompaniya_id, rol: a.rol })) ?? [];
    if (!superadmin && kompaniyalar.some(k => k.rol === 'superadmin')) return { authority: null };
    const contexts = j.context_kompaniyalar;
    const authority: Sess = { ...sess, rol: superadmin ? 'superadmin' : (kompaniyalar[0]?.rol as Sess['rol'] ?? 'rahbar'), kompaniyalar,
      permissionsByCompany: contexts?.every(k => Array.isArray(k.permissions)) ? Object.fromEntries(contexts.map(k => [k.kompaniya_id,k.permissions!])) : undefined,
      explicitDenialsByCompany: contexts ? Object.fromEntries(contexts.map(k=>[k.kompaniya_id,k.explicit_denials ?? []])) : undefined,
      // T4: faqat DB aniq qaytargan bo'lsa (eski javobda maydon yo'q → cheklov yo'q).
      modullarOffByCompany: contexts?.some(k => Array.isArray(k.modullar_off)) ? Object.fromEntries(contexts.map(k => [k.kompaniya_id, Array.isArray(k.modullar_off) ? k.modullar_off : []])) : undefined };
    return { authority, bekor };
  } catch { return { authority: null }; }
}
