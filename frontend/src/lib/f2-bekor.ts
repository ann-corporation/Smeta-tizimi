/**
 * F2 NI BEKOR QILISH (egasi 2026-10-31): har qanday holatdagi F2 — tasdiqlangan ham — sabab bilan bekor qilinadi.
 * Server: t2_akt_lifecycle_transition_v1 (to_status 'cancelled'; migratsiya 20261117100000 approved → cancelled ni ochadi).
 * Hech narsa o'chirilmaydi: akt va qatorlari tarixda qoladi, faqat jamilardan chiqadi.
 * Ruxsat: f2.cancel; tasdiqlangan F2 uchun qo'shimcha f2.approve (F2 tasdiqlay oladiganlar yoki admin/boss).
 */
import type { PtoLifecycleResult, PtoLifecycleStatus } from '../api/t2-akt-lifecycle';
import { t } from '../i18n/til';

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

/** Server `bogliq` obyekti: DEPENDENTS_EXIST da qaytadi (t2_akt_lifecycle_transition_v1). */
export type F2Bogliq = { forma3?: unknown; storno_aktlar?: unknown; davr_muhr?: unknown };
const idlar = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : []);

/** DEPENDENTS_EXIST: aniq nima bog'langan va avval nimani bekor qilish kerakligi (xom xato emas). */
export function f2BogliqMatni(b: unknown): string {
  const o = (b && typeof b === 'object' && !Array.isArray(b) ? b : {}) as F2Bogliq;
  const qismlar: string[] = [];
  const f3 = idlar(o.forma3), st = idlar(o.storno_aktlar);
  if (f3.length) qismlar.push(t('Forma 3 (№ {n}) — avval shu Forma 3 ni bekor qiling', { n: f3.join(', ') }));
  if (st.length) qismlar.push(t('storno / pereraschet F2 (akt № {n}) — avval ularni bekor qiling', { n: st.join(', ') }));
  if (o.davr_muhr === true) qismlar.push(t('davr muhrlangan — avval davrni qayta oching'));
  return qismlar.join('; ');
}

/** F2 bekor qilish javobi (lifecycle yoki eski yo'l) → foydalanuvchiga tushunarli matn; noma'lum kod — server xabari / zaxira. */
export function f2BekorXatoMatni(r: { code?: string | null; xabar?: string | null; error?: string | null; bogliq?: unknown }, zaxira = 'Bekor qilinmadi'): string {
  switch (r.code) {
    case 'DEPENDENTS_EXIST': {
      const b = f2BogliqMatni(r.bogliq);
      return t('Bu F2 ni bekor qilib bo‘lmaydi: unga bog‘liq hujjatlar bor.') + (b ? ' ' + b + '.' : '');
    }
    case 'STALE_VERSION': return t('F2 boshqa oynada o‘zgargan — sahifani yangilab qayta urining.');
    case 'REASON_REQUIRED': return t('Bekor qilish sababini yozing.');
    case 'INVALID_LIFECYCLE_TRANSITION': return t('Bu holatdagi F2 ni bekor qilib bo‘lmaydi (yangi versiya bilan almashtirilgan bo‘lishi mumkin).');
    case 'PERMISSION_DENIED': case 'ROL_YETARLI_EMAS': return t('Tasdiqlangan F2 ni bekor qilish uchun F2 tasdiqlash va bekor qilish huquqi kerak.');
    default: return r.xabar || r.error || t(zaxira);
  }
}