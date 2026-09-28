import type { PtoLifecycleStatus } from '../api/t2-akt-lifecycle';

export type F2LifecycleTarget = 'approved' | 'rejected' | 'cancelled';
export const f2LifecycleLabels: Record<PtoLifecycleStatus, string> = {
  draft: 'Qoralama', submitted: 'Tekshirishga yuborilgan', checked: 'Tekshirilgan',
  approved: 'Tasdiqlangan', rejected: 'Rad etilgan', cancelled: 'Bekor qilingan', superseded: 'Yangi tahrir bilan almashtirilgan',
};

/** Resume only from authoritative server state; never repeat an earlier stage. */
export function f2LifecyclePlan(current: PtoLifecycleStatus, target: F2LifecycleTarget): PtoLifecycleStatus[] | null {
  if (current === target) return [];
  if (current === 'approved' || current === 'cancelled' || current === 'superseded') return null;
  if (target === 'cancelled') return ['cancelled'];
  const chain: PtoLifecycleStatus[] = ['submitted', 'checked', target];
  if (current === 'draft' || current === 'rejected') return chain;
  if (current === 'submitted') return chain.slice(1);
  if (current === 'checked') return chain.slice(2);
  return null;
}

export function f2LifecycleError(code?: string): string {
  if (code === 'STALE_VERSION') return 'Hujjat boshqa joyda yangilangan. Joriy holat qayta yuklandi; tekshirib, amalni davom ettiring.';
  if (code === 'INVALID_LIFECYCLE_TRANSITION') return 'Hujjatning holati o‘zgargan. Joriy bosqich qayta yuklandi.';
  if (code === 'AKT_NOT_FOUND') return 'Bu hujjat tanlangan kompaniyada topilmadi.';
  if (code === 'REASON_REQUIRED') return 'Rad etish yoki bekor qilish sababini kiriting.';
  return 'F2 holatini saqlab bo‘lmadi. Joriy holat qayta yuklandi; qayta urinishdan oldin uni tekshiring.';
}
