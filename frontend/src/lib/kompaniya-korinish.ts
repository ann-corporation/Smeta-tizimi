/**
 * Kompaniya sahifasi — ruxsatlar matritsasi ko'rinishi (egasi 2026-10-25: «rol/ruxsat jadvali o'qiladigan bo'lsin»).
 * Manba o'zgarmaydi: PERMISSIONS / ROLE_PERMISSIONS (lib/company-authorization). Bu yerda faqat guruhlash va sanash:
 * qatorlar — soha bo'yicha guruhlangan ruxsatlar, ustunlar — lavozimlar.
 */
import { MEMBERSHIP_ROLES, PERMISSIONS, ROLE_PERMISSIONS, type CompanyMembershipRole, type PermissionCode } from './company-authorization/effective-authorization';

export type RuxsatGuruhKod = 'kompaniya' | 'sozlama' | 'loyiha' | 'hujjat' | 'moliya' | 'f2' | 'smeta';
export const RUXSAT_GURUH_NOMI: Record<RuxsatGuruhKod, string> = {
  kompaniya: 'Kompaniya va a’zolar', sozlama: 'Sozlamalar', loyiha: 'Loyiha va obyekt', hujjat: 'Hujjatlar',
  moliya: 'Moliya', f2: 'F2 (bajarilgan ishlar akti)', smeta: 'Smeta, fakt va narx',
};
const TARTIB: RuxsatGuruhKod[] = ['kompaniya', 'sozlama', 'loyiha', 'hujjat', 'moliya', 'f2', 'smeta'];

export function ruxsatGuruhi(p: PermissionCode): RuxsatGuruhKod {
  if (p.startsWith('company.')) return 'kompaniya';
  if (p.startsWith('control.')) return 'sozlama';
  if (p.startsWith('project.') || p.startsWith('object.')) return 'loyiha';
  if (p.startsWith('document.')) return 'hujjat';
  if (p.startsWith('financial.')) return 'moliya';
  if (p.startsWith('f2.')) return 'f2';
  return 'smeta';
}

/** «.read» — ko'rish; qolgani — amal (yozish/boshqarish). */
export const ruxsatTuri = (p: PermissionCode): 'korish' | 'amal' => (p.endsWith('.read') ? 'korish' : 'amal');

/** Kompaniya ichida beriladigan lavozimlar (platforma darajasidagi superadmin/admin emas). */
export const MATRITSA_ROLLAR: CompanyMembershipRole[] = MEMBERSHIP_ROLES.filter((r) => r !== 'superadmin' && r !== 'admin');
/** Kompaniya darajasidagi ruxsatlar (platforma — control.global.* — kirmaydi). */
export const MATRITSA_RUXSATLAR: PermissionCode[] = PERMISSIONS.filter((p) => !p.startsWith('control.global'));

export type MatritsaGuruh = { kod: RuxsatGuruhKod; ruxsatlar: PermissionCode[] };
export function ruxsatMatritsa(ruxsatlar: readonly PermissionCode[] = MATRITSA_RUXSATLAR): MatritsaGuruh[] {
  const m = new Map<RuxsatGuruhKod, PermissionCode[]>();
  for (const p of ruxsatlar) { const g = ruxsatGuruhi(p); m.set(g, [...(m.get(g) ?? []), p]); }
  return TARTIB.filter((g) => m.has(g)).map((kod) => ({ kod, ruxsatlar: m.get(kod)! }));
}

export function rolBor(rol: CompanyMembershipRole, p: PermissionCode): boolean {
  return ROLE_PERMISSIONS[rol]?.includes(p) ?? false;
}

/** Lavozim bo'yicha: nechta ruxsat (ko'rish / amal) — ustun sarlavhasidagi qisqa xulosa. */
export function rolSanoq(rol: CompanyMembershipRole, ruxsatlar: readonly PermissionCode[] = MATRITSA_RUXSATLAR): { korish: number; amal: number; jami: number } {
  let korish = 0, amal = 0;
  for (const p of ruxsatlar) if (rolBor(rol, p)) { if (ruxsatTuri(p) === 'korish') korish++; else amal++; }
  return { korish, amal, jami: ruxsatlar.length };
}
