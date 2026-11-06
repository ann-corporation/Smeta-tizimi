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

/* ── Tasdiqlash rejimi (audit 2026-10-21 ARC-02; egasi ADR-2) ──────────────────────────────────────────────────────
 * shaxsiy    — yakka smetachi: bitta bosish «Yakunlash (shaxsiy)»; bu kompaniya tasdig'i EMAS.
 * korporativ — har bosqich alohida tugma; bazada tayyorlovchi ≠ tekshiruvchi ≠ tasdiqlovchi (t2_akt_lifecycle_transition_v1). */
export type F2TasdiqRejimi = 'shaxsiy' | 'korporativ';
export const f2TasdiqRejimi = (v: unknown): F2TasdiqRejimi => (v === 'korporativ' ? 'korporativ' : 'shaxsiy');

/** Korporativ rejimda keyingi BITTA qadam (yuborish → tekshirish → tasdiqlash); qolgan holatlarda — null. */
export function f2KeyingiQadam(current: PtoLifecycleStatus): 'submitted' | 'checked' | 'approved' | null {
  if (current === 'draft' || current === 'rejected') return 'submitted';
  if (current === 'submitted') return 'checked';
  if (current === 'checked') return 'approved';
  return null;
}

/** Tugma matni (o'zbekcha manba; chaqiruvchi t() bilan tarjima qiladi). */
export function f2QadamTugmasi(rejim: F2TasdiqRejimi, current: PtoLifecycleStatus): string | null {
  if (rejim === 'shaxsiy') return current === 'approved' || current === 'cancelled' || current === 'superseded' ? null : 'Yakunlash (shaxsiy)';
  const q = f2KeyingiQadam(current);
  return q === 'submitted' ? 'Tekshiruvga yuborish' : q === 'checked' ? 'Tekshirildi' : q === 'approved' ? 'Tasdiqlash' : null;
}

/** Holat yorlig'i: shaxsiy rejimda yakunlangan akt «Tasdiqlangan» deb ko'rsatilmaydi. */
export function f2HolatYorligi(status: PtoLifecycleStatus, rejim: F2TasdiqRejimi): string {
  return status === 'approved' && rejim === 'shaxsiy' ? 'Yakunlangan (shaxsiy)' : f2LifecycleLabels[status];
}

/**
 * Rad etish rejasi (audit C M5): korporativ rejimda rad etish faqat TEKSHIRILGAN hujjatda va bitta qadam (`rejected`) —
 * avval draft/submitted dan «yuborish → tekshirish → rad» zanjiri SoD da yarim yo'lda to'xtab, hujjatni boshqa holatda
 * qoldirardi. Shaxsiy rejim — avvalgidek (bitta foydalanuvchi zanjiri). null — rad etib bo'lmaydi.
 */
export function f2RadRejasi(rejim: F2TasdiqRejimi, current: PtoLifecycleStatus): PtoLifecycleStatus[] | null {
  if (rejim === 'korporativ') return current === 'checked' ? ['rejected'] : null;
  const p = f2LifecyclePlan(current, 'rejected');
  return p && p.length ? p : null;
}

/** Saqlangan qatorning `raw_snapshot.narxsizSabab = 'avto_qoralama'` — narxsiz avtomatik qoralama (server tasdiqni NARXSIZ_QATOR_BOR bilan rad etadi). */
export function avtoNarxsizSoni(qatorlar: ReadonlyArray<{ raw_snapshot?: unknown }>): number {
  let n = 0;
  for (const q of qatorlar) {
    const s = q.raw_snapshot as { narxsizSabab?: unknown } | null | undefined;
    if (s && typeof s === 'object' && s.narxsizSabab === 'avto_qoralama') n++;
  }
  return n;
}

export function f2LifecycleError(code?: string): string {
  if (code === 'NARXSIZ_QATOR_BOR') return 'Hujjatda narxi aniqlanmagan qatorlar bor — «F2 tayyorlash»da narx kiriting yoki ongli «narxsiz» deb belgilang, so‘ng tasdiqlang.';
  if (code === 'SOD_TEKSHIRUVCHI_YUBORUVCHI') return 'Hujjatni yuborgan odam uni o‘zi tekshira olmaydi — boshqa xodim tekshirishi kerak.';
  if (code === 'SOD_TASDIQLOVCHI_TAKRORLANDI') return 'Hujjatni yuborgan yoki tekshirgan odam uni tasdiqlay olmaydi — uchinchi xodim tasdiqlashi kerak.';
  if (code === 'STALE_VERSION') return 'Hujjat boshqa joyda yangilangan. Joriy holat qayta yuklandi; tekshirib, amalni davom ettiring.';
  if (code === 'INVALID_LIFECYCLE_TRANSITION') return 'Hujjatning holati o‘zgargan. Joriy bosqich qayta yuklandi.';
  if (code === 'AKT_NOT_FOUND') return 'Bu hujjat tanlangan kompaniyada topilmadi.';
  if (code === 'REASON_REQUIRED') return 'Rad etish yoki bekor qilish sababini kiriting.';
  return 'F2 holatini saqlab bo‘lmadi. Joriy holat qayta yuklandi; qayta urinishdan oldin uni tekshiring.';
}
