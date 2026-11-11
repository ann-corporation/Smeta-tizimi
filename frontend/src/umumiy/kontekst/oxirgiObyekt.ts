/**
 * Oxirgi ishlatilgan obyekt (+ davr) — brauzerda eslab qolinadi (navigatsiya oqimi, 2026-11-11).
 * Maqsad: obyekt BIR marta tanlanadi; yangi sessiya/kirishdan keyin ham shu obyekt ochiladi (kompaniya bo'yicha).
 * Bu ko'rinish qulayligi, xavfsizlik EMAS: qiymat har doim joriy kompaniya ro'yxati bilan qayta tekshiriladi
 * (PTOWorkspaceProvider.validateHierarchy), boshqa kompaniya obyekti hech qachon qabul qilinmaydi.
 */
const KALIT = 'fz-oxirgi-obyekt';

export type OxirgiObyekt = { companyId: number; objectId: number; periodId: string | null };

export function oxirgiObyektOl(companyId: number | null | undefined): OxirgiObyekt | null {
  if (companyId == null) return null;
  try {
    const xom = localStorage.getItem(KALIT);
    if (!xom) return null;
    const v = JSON.parse(xom) as Partial<OxirgiObyekt> | null;
    if (!v || v.companyId !== companyId || !Number.isSafeInteger(v.objectId) || (v.objectId as number) <= 0) return null;
    return { companyId, objectId: v.objectId as number, periodId: typeof v.periodId === 'string' ? v.periodId : null };
  } catch { return null; }
}

export function oxirgiObyektYoz(companyId: number, objectId: number, periodId: string | null): void {
  try { localStorage.setItem(KALIT, JSON.stringify({ companyId, objectId, periodId })); } catch { /* xotira yopiq */ }
}

export function oxirgiObyektTozala(): void {
  try { localStorage.removeItem(KALIT); } catch { /* xotira yopiq */ }
}
