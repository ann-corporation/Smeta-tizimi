import type { Sess } from './auth';
import { supabaseBaseUrl } from './supabase-url';

const WRITERS = new Set(['superadmin', 'admin', 'boss', 'pto', 'prorab', 'bugalter']);
/** All resolved target companies must authorize the write, even without a body company_id. */
export function mayWriteCompanies(sess: Sess, companyIds: readonly number[], permission?: string): boolean {
  if (!sess.kompaniyalar) return false;
  if (!companyIds.length) return sess.kompaniyalar.some(a => WRITERS.has(a.rol));
  return companyIds.every(id => sess.kompaniyalar!.some(a => a.kompaniya_id === id && (permission && sess.permissionsByCompany ? sess.permissionsByCompany[id]?.includes(permission) : WRITERS.has(a.rol))));
}

/** Egasi 2026-10-21: «PTO bo'lib kirgan bo'lsam tizim eslab qolishi yetarli — Jarvis'ga har so'rovda qayta tekshirish
 *  ortiqcha». DB vakolati (t2_men_v1) shu isolate xotirasida qisqa muddat saqlanadi. Cookie'dagi rolga ishonilmaydi —
 *  kesh faqat DB javobidan; rol olib tashlansa ko'pi bilan VAKOLAT_KESH_MS ichida kuchga kiradi. Xato javob keshlanmaydi. */
export const VAKOLAT_KESH_MS = 60_000;
type Vakolat = Pick<Sess, 'rol' | 'kompaniyalar' | 'permissionsByCompany' | 'explicitDenialsByCompany'>;
const vakolatKesh = new Map<number, { vaqt: number; qiymat: Vakolat }>();
export function vakolatKeshTozala(foydalanuvchiId?: number) { if (foydalanuvchiId == null) vakolatKesh.clear(); else vakolatKesh.delete(foydalanuvchiId); }

/** DB authority (keshlangan, ≤60 s); signed login role is not a live permission. */
export async function roleAuthority(sess: Sess, env: { SUPABASE_URL: string; SUPABASE_KEY: string }): Promise<Sess | null> {
  if (!Number.isSafeInteger(sess.foydalanuvchi_id) || !sess.foydalanuvchi_id) return null;
  const id = sess.foydalanuvchi_id as number;
  const k = vakolatKesh.get(id);
  if (k && Date.now() - k.vaqt < VAKOLAT_KESH_MS) return { ...sess, ...k.qiymat };
  const yangi = await roleAuthorityDb(sess, env);
  if (yangi) {
    if (vakolatKesh.size > 5000) vakolatKesh.clear();
    vakolatKesh.set(id, { vaqt: Date.now(), qiymat: { rol: yangi.rol, kompaniyalar: yangi.kompaniyalar, permissionsByCompany: yangi.permissionsByCompany, explicitDenialsByCompany: yangi.explicitDenialsByCompany } });
  } else vakolatKesh.delete(id);
  return yangi;
}

async function roleAuthorityDb(sess: Sess, env: { SUPABASE_URL: string; SUPABASE_KEY: string }): Promise<Sess | null> {
  try {
    const r = await fetch(supabaseBaseUrl(env.SUPABASE_URL) + '/rest/v1/rpc/t2_men_v1', {
      method: 'POST', headers: { apikey: env.SUPABASE_KEY, Authorization: 'Bearer ' + env.SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_actor_id: sess.foydalanuvchi_id }),
    });
    if (!r.ok) return null;
    const j = await r.json() as { ok?: boolean; platform_role?: string; foydalanuvchi?: { holat?: string }; context_kompaniyalar?: { kompaniya_id: number; effective_role: string; permissions?: string[]; explicit_denials?: string[] }[]; azoliklar?: { kompaniya_id: number; rol: string; faol?: boolean }[] };
    if (!j.ok || j.foydalanuvchi?.holat !== 'faol') return null;
    // Older DB response remains least-privilege: never trust cookie superadmin.
    const superadmin = j.platform_role === 'superadmin';
    const kompaniyalar = j.context_kompaniyalar?.map(k => ({ kompaniya_id: k.kompaniya_id, rol: k.effective_role }))
      ?? j.azoliklar?.filter(a => a.faol !== false).map(a => ({ kompaniya_id: a.kompaniya_id, rol: a.rol })) ?? [];
    if (!superadmin && kompaniyalar.some(k => k.rol === 'superadmin')) return null;
    const contexts = j.context_kompaniyalar;
    return { ...sess, rol: superadmin ? 'superadmin' : (kompaniyalar[0]?.rol as Sess['rol'] ?? 'rahbar'), kompaniyalar,
      permissionsByCompany: contexts?.every(k => Array.isArray(k.permissions)) ? Object.fromEntries(contexts.map(k => [k.kompaniya_id,k.permissions!])) : undefined,
      explicitDenialsByCompany: contexts ? Object.fromEntries(contexts.map(k=>[k.kompaniya_id,k.explicit_denials ?? []])) : undefined };
  } catch { return null; }
}
