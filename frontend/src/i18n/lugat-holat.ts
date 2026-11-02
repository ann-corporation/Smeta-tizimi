import type { Lugat } from './lugat';

/** Yuklangan ru/en lug'ati (til.ts o'qiydi). Alohida modul — testlar `til` ni mock qilsa ham oldindan to'ldirish ishlaydi. */
export const lugatHolat: { lugat: Record<'ru' | 'en', Lugat> | null } = { lugat: null };
