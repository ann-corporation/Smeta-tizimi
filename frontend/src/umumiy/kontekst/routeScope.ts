/**
 * routeScope.ts — har bir /admin marshrutining KONTEKST SINFI.
 * ═══════════════════════════════════════════════════════════════════
 * Codex auditi (T2_COMPANY_CONTEXT_UX_AUDIT_001_CODEX.md §10, §18) asosida.
 *
 *   GLOBAL         — kompaniya konteksti KERAK EMAS (identity, registry,
 *                    platforma boshqaruvi).
 *   COMPANY_SCOPED — bitta kompaniyaga tegishli ma'lumot.
 *   PROJECT_SCOPED — kompaniya + loyiha.
 *   OBJECT_SCOPED  — kompaniya + loyiha + obyekt.
 *   USER_SCOPED    — faqat foydalanuvchi (login, o'z profili).
 *   LEGACY         — Tizim_01 / eski GAS sahifalari (arxiv navigatsiyada).
 *
 * COMPANY_SCOPED va undan chuqurroq marshrutlar kompaniya yo'q bo'lsa
 * <KompaniyaKerak/> professional bo'sh holatini ko'rsatadi — xom xato EMAS.
 * GLOBAL marshrutlar hech qachon bu qo'riqchini ko'rsatmaydi.
 */
import { NAV_SAHIFALAR } from '../../lib/nav/navReestr';

export type RouteScope = 'GLOBAL' | 'COMPANY_SCOPED' | 'PROJECT_SCOPED' | 'OBJECT_SCOPED' | 'USER_SCOPED' | 'LEGACY';

/* 2026-10-26 (tizim xaritasi S1): menyudagi sahifalarning kontekst sinfi — yagona navigatsiya reestridan
 * (lib/nav/navReestr.ts `scope`). Bu yerda faqat menyuda YO'Q yo'llar qoladi (kirish, eski /admin/test/*).
 * Natijaviy xarita avvalgisi bilan aynan bir xil (navFiltr.test.ts) — RuxsatGuard xulqi o'zgarmagan.
 *   /admin/kompaniya — identity + a'zoliklar + registry (t2_men_v1)
 *   /admin/system-control — kompaniya_id yo'q → t2_system_control_global_v1 (platforma roli); bor → t2_system_control_v1 */
const MENYUDAN = Object.fromEntries(NAV_SAHIFALAR.flatMap((s) => (s.scope ? [[s.yol, s.scope]] : []))) as Record<string, RouteScope>;

export const ROUTE_SCOPE: Record<string, RouteScope> = {
  '/': 'USER_SCOPED',
  ...MENYUDAN,

  // COMPANY_SCOPED (eski SINOV qobig'i)
  '/admin/test/portfel': 'COMPANY_SCOPED',
  '/admin/test/moliya': 'COMPANY_SCOPED',
  '/admin/test/logistika': 'COMPANY_SCOPED',
  '/admin/test/crm': 'COMPANY_SCOPED',
  '/admin/test/smeta': 'COMPANY_SCOPED',
  '/admin/test/zayavka': 'COMPANY_SCOPED',
  '/admin/test/erp': 'COMPANY_SCOPED',
  '/admin/test/xarita': 'COMPANY_SCOPED',
  '/admin/test/kontragent': 'COMPANY_SCOPED',
  '/admin/test/sozlama': 'COMPANY_SCOPED',

  // PROJECT_SCOPED
  '/admin/test/aosr': 'PROJECT_SCOPED',

  // OBJECT_SCOPED
  '/admin/test/obyektlar': 'OBJECT_SCOPED',
  '/admin/test/saqlash': 'OBJECT_SCOPED',
};

/** GLOBAL bo'lmagan (kompaniya kerak bo'ladigan) marshrutmi? */
export function kompaniyaKerakmi(pathname: string): boolean {
  const exact = ROUTE_SCOPE[pathname];
  const s = exact || Object.entries(ROUTE_SCOPE).find(([route]) => pathname.startsWith(route + '/'))?.[1];
  if (!s) return false; // noma'lum/legacy — o'z-o'zini qo'riqlaydi
  return s === 'COMPANY_SCOPED' || s === 'PROJECT_SCOPED' || s === 'OBJECT_SCOPED';
}
