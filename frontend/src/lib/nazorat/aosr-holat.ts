/**
 * aosr-holat.ts - F2 qatori uchun АОСР holati (FAQAT MA'LUMOT, hajmni hech qachon bloklamaydi).
 *   yoq        - yashirin ish, akt yo'q
 *   kutilmoqda - akt bor, lekin hali imzolanmagan ('yangi')
 *   imzolangan - akt tasdiqlangan yoki qog'ozda imzolangan
 *   bor        - akt bor, holati ma'lum emas (view hali akt_holat bermaydi)
 *   kerak_emas - yashirin ish emas
 * Holat noma'lum bo'lsa "imzolangan" deb o'ylab topilmaydi.
 */
export type AosrIshora = 'yoq' | 'kutilmoqda' | 'imzolangan' | 'bor' | 'kerak_emas';

export type AosrQatorHolati = {
  yashirin: boolean;
  akt_bor: boolean;
  /** Qatorga bog'langan aktlarning eng yaxshi holati (view kengaytirilgach keladi). */
  akt_holat?: 'yangi' | 'tasdiqlangan' | 'qogoz' | null;
};

export function aosrIshora(c: AosrQatorHolati): AosrIshora {
  if (!c.yashirin) return 'kerak_emas';
  if (!c.akt_bor) return 'yoq';
  if (c.akt_holat === 'tasdiqlangan' || c.akt_holat === 'qogoz') return 'imzolangan';
  if (c.akt_holat === 'yangi') return 'kutilmoqda';
  return 'bor';
}

export function aosrYigindi(royxat: readonly AosrQatorHolati[]): Record<AosrIshora, number> {
  const s: Record<AosrIshora, number> = { yoq: 0, kutilmoqda: 0, imzolangan: 0, bor: 0, kerak_emas: 0 };
  for (const c of royxat) s[aosrIshora(c)] += 1;
  return s;
}

export const AOSR_ISHORA_MATNI: Record<Exclude<AosrIshora, 'kerak_emas'>, string> = {
  yoq: 'yashirin · АОСР yo‘q',
  kutilmoqda: 'АОСР imzo kutilmoqda',
  imzolangan: 'АОСР imzolangan',
  bor: 'АОСР bor',
};
