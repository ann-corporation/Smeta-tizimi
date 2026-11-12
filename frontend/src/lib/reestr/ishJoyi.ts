/**
 * ISH JOYLARI (ekotizim V2 §2): 7 ta yopiq ish joyi + `sotuv` (faqat modul yoqilganda) + `platforma` (faqat superadmin, menyuda emas).
 * Sof ma'lumot (React yo'q).
 */
export const ISH_JOYLARI = ['bugun', 'obyekt', 'hujjatlar', 'taminot', 'moliya', 'tomonlar', 'kompaniya', 'sotuv', 'platforma'] as const;
export type IshJoyi = (typeof ISH_JOYLARI)[number];

/** Menyuda ko'rinadigan 7 asosiy ish joyi (sotuv — modulga bog'liq, platforma — menyuda yo'q). */
export const ASOSIY_ISH_JOYLARI: readonly IshJoyi[] = ['bugun', 'obyekt', 'hujjatlar', 'taminot', 'moliya', 'tomonlar', 'kompaniya'];
