/** Barcha darslar (yagona ro‘yxat). Tartib — rolning kundalik zanjiri tartibi. */
import type { Dars } from './model';
import { DARSLAR_ICHKI } from './darslar-ichki';
import { DARSLAR_TOMON } from './darslar-tomon';

export const DARSLAR: readonly Dars[] = [...DARSLAR_ICHKI, ...DARSLAR_TOMON];

export const darsOl = (id: string): Dars | undefined => DARSLAR.find((d) => d.id === id);
