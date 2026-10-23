import type { SbJavob, SbSoro } from '../../api/supabase';

export type AvvalgiF2 = { id: number; oy: string; raqam: string | null; holat: string; lifecycle_status?: string | null; versiya?: number };

/** Qoralama akt (hali tasdiqlanmagan) — F2 import uni seans davomida qayta saqlab yangilay oladi. */
export const qoralamaAktmi = (a: AvvalgiF2 | null | undefined): a is AvvalgiF2 & { versiya: number } =>
  !!a && a.holat === 'qoralama' && (a.lifecycle_status ?? 'draft') === 'draft' && Number.isSafeInteger(a.versiya);

/** F2 hujjat raqami (akt №): chetdagi bo'sh joylar olib tashlanadi; server `t2_akt.raqam` ga 100 belgigacha yozadi.
 * Bo'sh raqam — raqamsiz F2 (eski xulq). */
export const f2RaqamNormal = (raqam: string | null | undefined): string => String(raqam ?? '').trim().slice(0, 100);

/** Same canonical identity that akt_yarat_v2 writes: object + F2 + month + number (blank number = null/'').
 * The unique key is `(obyekt_id, tur, oy, coalesce(raqam,''))` (cancelled acts excluded), so another F2 with a
 * DIFFERENT number in the same month is not a duplicate. A matching identity does not prove identical contents. */
export async function avvalgiF2Ol(oqi: (s: SbSoro) => Promise<SbJavob<AvvalgiF2>>, companyId: number, objectId: number, month: string, raqam?: string | null): Promise<AvvalgiF2 | null> {
  if (!Number.isSafeInteger(companyId) || companyId <= 0 || !Number.isSafeInteger(objectId) || objectId <= 0 || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('F2_SCOPE_INVALID');
  const n = f2RaqamNormal(raqam);
  const raqamFiltr = n ? `raqam=eq.${encodeURIComponent(n)}` : 'or=(raqam.is.null,raqam.eq.)';
  const r = await oqi({ jadval: 't2_akt',
    // Bekor qilingan akt hisobga olinmaydi (egasi 2026-10-21): u tarixda qoladi, shu davr uchun yangi F2 kiritiladi.
    filtr: `kompaniya_id=eq.${companyId}&obyekt_id=eq.${objectId}&tur=eq.f2&holat=neq.bekor&oy=eq.${month}-01&${raqamFiltr}`,
    ustunlar: 'id,oy,raqam,holat,lifecycle_status,versiya', tartib: 'id.desc', limit: 1 });
  if (!r.ok || r.toliq === false) throw new Error('F2_DUPLICATE_CHECK_FAILED');
  return r.qatorlar?.[0] ?? null;
}
