import type { SbJavob, SbSoro } from '../../api/supabase';

export type AvvalgiF2 = { id: number; oy: string; raqam: string | null; holat: string; lifecycle_status?: string | null; versiya?: number };

/** Qoralama akt (hali tasdiqlanmagan) — F2 import uni seans davomida qayta saqlab yangilay oladi. */
export const qoralamaAktmi = (a: AvvalgiF2 | null | undefined): a is AvvalgiF2 & { versiya: number } =>
  !!a && a.holat === 'qoralama' && (a.lifecycle_status ?? 'draft') === 'draft' && Number.isSafeInteger(a.versiya);

/** Same canonical identity that akt_yarat_v2 writes (object + F2 + month + blank number).
 * A matching identity does not prove that two files have identical contents. */
export async function avvalgiF2Ol(oqi: (s: SbSoro) => Promise<SbJavob<AvvalgiF2>>, companyId: number, objectId: number, month: string): Promise<AvvalgiF2 | null> {
  if (!Number.isSafeInteger(companyId) || companyId <= 0 || !Number.isSafeInteger(objectId) || objectId <= 0 || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('F2_SCOPE_INVALID');
  const r = await oqi({ jadval: 't2_akt',
    filtr: `kompaniya_id=eq.${companyId}&obyekt_id=eq.${objectId}&tur=eq.f2&oy=eq.${month}-01&or=(raqam.is.null,raqam.eq.)`,
    ustunlar: 'id,oy,raqam,holat,lifecycle_status,versiya', tartib: 'id.desc', limit: 1 });
  if (!r.ok || r.toliq === false) throw new Error('F2_DUPLICATE_CHECK_FAILED');
  return r.qatorlar?.[0] ?? null;
}
