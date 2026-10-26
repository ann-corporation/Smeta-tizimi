import { routePermission } from '../company-authorization/route-permission';

/**
 * Egasi qarori (2026-10-26, Codex review #142 / JQA-10): buxgalter F2 ni faqat O'QIYDI — import, tayyorlash,
 * tasdiqlash, bekor qilish va tuzatish qila olmaydi.
 * Server: `20261110100000_t2_bugalter_f2_yozish_yopiq_v1.sql` `t2_role_permissions_v2` dan bugalter uchun
 * f2.import/prepare/approve/cancel/correct ni olib tashlaydi. Bu yerda — o'sha qoidaning UI aksi (menyu, tablar,
 * Ctrl+K, F2 tarixi tugmalari): a'zolik konstruktori orqali individual berilgan bo'lsa ham buxgalterga ko'rinmaydi.
 */
export const F2_YOZISH_CAPABILITY = ['f2.import', 'f2.prepare', 'f2.approve', 'f2.cancel', 'f2.correct'] as const;

const YOPIQ: Readonly<Record<string, readonly string[]>> = {
  bugalter: F2_YOZISH_CAPABILITY,
};

/** Shu rolga bu capability UI da umuman ko'rsatilmaydimi. */
export function rolCapabilityYopiq(rol: string | null | undefined, capability: string): boolean {
  const ruxsatlar = rol ? YOPIQ[rol] : undefined;
  return !!ruxsatlar && ruxsatlar.includes(capability);
}

/** Menyu/tab yo'li (route-permission orqali) shu rolga yopiqmi. */
export function menyuRolYopiq(rol: string | null | undefined, yol: string): boolean {
  return rolCapabilityYopiq(rol, routePermission(yol));
}

/** Rol uchun F2 yozish amallari (import/tayyorlash/tasdiqlash/bekor/tuzatish) yopiqmi. */
export function rolF2YozishYopiq(rol: string | null | undefined): boolean {
  return F2_YOZISH_CAPABILITY.some((c) => rolCapabilityYopiq(rol, c));
}
