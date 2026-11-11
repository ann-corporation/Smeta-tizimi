/**
 * Jonli vakolat — web ilova bilan AYNAN bir xil manba: `roleAuthority` (frontend/functions/_shared/role-authority.ts →
 * t2_men_v1, ≤60 s kesh, sessiya_bekor_dan va hisob holati). OAuth tokenidagi props faqat foydalanuvchi id si; kompaniyalar
 * va rol har chaqiruvda bazadan olinadi (token ichidagi rolga ishonilmaydi). Yozish ruxsati — `mayWriteCompanies`
 * (web /api/sb-yoz bilan bir xil rol to'plami); RPC'lar o'zi ham p_actor_id bo'yicha tekshiradi.
 */
import { SESSIYA_MUDDAT_MS, type Sess } from '../../../frontend/functions/_shared/auth';
import { mayWriteCompanies, roleAuthority } from '../../../frontend/functions/_shared/role-authority';
import type { Props } from './env';

export type Vakolat = { foydalanuvchiId: number; superadmin: boolean; kompaniyalar: Array<{ kompaniya_id: number; rol: string }>; sess: Sess };

/** Token props → sessiya shakli (roleAuthority iat ni exp − SESSIYA_MUDDAT_MS dan hisoblaydi). */
export function propsSess(p: Props): Sess {
  return { rol: 'kuzatuvchi' as Sess['rol'], foydalanuvchi_id: p.foydalanuvchi_id, exp: p.iat + SESSIYA_MUDDAT_MS, jti: `mcp-oauth:${p.foydalanuvchi_id}` };
}

export async function vakolatOl(p: Props, env: { SUPABASE_URL: string; SUPABASE_KEY: string }, ra: typeof roleAuthority = roleAuthority): Promise<Vakolat | null> {
  if (!p || !Number.isSafeInteger(p.foydalanuvchi_id) || p.foydalanuvchi_id <= 0) return null;
  const s = await ra(propsSess(p), env);
  if (!s || !Array.isArray(s.kompaniyalar)) return null;
  return { foydalanuvchiId: p.foydalanuvchi_id, superadmin: s.rol === 'superadmin', kompaniyalar: s.kompaniyalar, sess: s };
}

/** O'qish: har kompaniyada faol a'zolik (superadmin — t2_men_v1 context_kompaniyalar orqali barcha faol kompaniyalar). */
export function oqishMumkin(v: Vakolat, kompaniyalar: readonly number[]): boolean {
  return kompaniyalar.every((k) => v.kompaniyalar.some((a) => a.kompaniya_id === k));
}

/** Yozish: web ilova bilan bir xil (`mayWriteCompanies`: superadmin/admin/boss/pto/prorab/bugalter). */
export function yozishMumkin(v: Vakolat, kompaniyalar: readonly number[]): boolean {
  return kompaniyalar.length > 0 && oqishMumkin(v, kompaniyalar) && mayWriteCompanies(v.sess, kompaniyalar);
}
