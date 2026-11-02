/**
 * F2 NI BEKOR QILISH (egasi 2026-10-31): har qanday holatdagi F2 — tasdiqlangan ham — sabab bilan bekor qilinadi.
 * Server: t2_akt_lifecycle_transition_v1 (to_status 'cancelled'; migratsiya 20261117100000 approved → cancelled ni ochadi).
 * Hech narsa o'chirilmaydi: akt va qatorlari tarixda qoladi, faqat jamilardan chiqadi.
 * Ruxsat: f2.cancel; tasdiqlangan F2 uchun qo'shimcha f2.approve (F2 tasdiqlay oladiganlar yoki admin/boss).
 */
import type { PtoLifecycleResult, PtoLifecycleStatus } from '../api/t2-akt-lifecycle';

/** Bekor qilish rejasi: bekor qilinadigan holatlar — ['cancelled']; allaqachon bekor — [] (takror); almashtirilgan — null. */
export function f2BekorRejasi(current: PtoLifecycleStatus): PtoLifecycleStatus[] | null {
  if (current === 'cancelled') return [];
  if (current === 'superseded') return null;
  return ['cancelled'];
}

export type F2BekorRuxsat = { mayCancel: boolean; mayApprove: boolean };

/** Shu holatdagi aktni bekor qilish mumkinmi (UI ruxsati; server baribir tekshiradi). */
export function f2BekorMumkin(current: PtoLifecycleStatus, r: F2BekorRuxsat): boolean {
  const reja = f2BekorRejasi(current);
  if (!reja || reja.length === 0 || !r.mayCancel) return false;
  return current === 'approved' ? r.mayApprove : true;
}

export type F2BekorAkt = { id: number; versiya: number; lifecycle_status: PtoLifecycleStatus; raqam?: string | null };
export type F2BekorNatija = {
  bajarildi: number[];
  /** Birinchi xatoda to'xtaydi — qolganlari tegilmaydi. */
  xato: { aktId: number; code: string | null; matn?: string } | null;
};

/**
 * Bir nechta aktni KETMA-KET bekor qiladi; har biri foydalanuvchi ko'rgan versiya bilan (CAS). Birinchi xatoda to'xtaydi.
 * `otish` — server chaqiruvi (testda soxta); `onProgress` — n/jami.
 */
export async function f2BekorBajar(
  aktlar: readonly F2BekorAkt[], sabab: string,
  otish: (a: F2BekorAkt) => Promise<PtoLifecycleResult>,
  onProgress?: (n: number, jami: number) => void,
): Promise<F2BekorNatija> {
  const bajarildi: number[] = [];
  const s = sabab.trim();
  if (!s) return { bajarildi, xato: { aktId: aktlar[0]?.id ?? 0, code: 'REASON_REQUIRED' } };
  for (const a of aktlar) {
    const reja = f2BekorRejasi(a.lifecycle_status);
    if (reja === null) return { bajarildi, xato: { aktId: a.id, code: 'INVALID_LIFECYCLE_TRANSITION' } };
    if (reja.length > 0) {
      let r: PtoLifecycleResult;
      try { r = await otish(a); } catch (e) { return { bajarildi, xato: { aktId: a.id, code: 'NETWORK_ERROR', matn: e instanceof Error ? e.message : String(e) } }; }
      if (!r.ok) return { bajarildi, xato: { aktId: a.id, code: r.code ?? null, matn: r.error } };
    }
    bajarildi.push(a.id);
    onProgress?.(bajarildi.length, aktlar.length);
  }
  return { bajarildi, xato: null };
}
