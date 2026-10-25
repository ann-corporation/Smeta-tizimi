import { routePermission } from '../company-authorization/route-permission';

/**
 * Egasi qarori (2026-10-26, Codex review #142): buxgalter F2 import va tayyorlash huquqini OLMAYDI.
 * Server (`t2_role_permissions_v2`) hozircha `bugalter` ga f2.import/prepare/approve beradi — bu MENYU/TAB
 * darajasidagi to'siq, server ruxsati bu yerda o'zgartirilmagan (alohida migratsiya kerak).
 * AdminShell `korinadi()` va shu orqali tablar/Ctrl+K bir manbadan filtrlanadi.
 */
const YOPIQ: Readonly<Record<string, readonly string[]>> = {
  bugalter: ['f2.import', 'f2.prepare'],
};

export function menyuRolYopiq(rol: string | null | undefined, yol: string): boolean {
  const ruxsatlar = rol ? YOPIQ[rol] : undefined;
  return !!ruxsatlar && ruxsatlar.includes(routePermission(yol));
}
