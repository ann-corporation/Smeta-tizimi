/** TOMON PROFILLARI (ekotizim V2 §2/§4): `t2_yonalish` kaliti -> standart ilovalar, bosh ish joyi, kabinet sahifalari. Yozuvlar 13-qadamda. */
import type { IlovaKod } from '../ilova/ilovalar';
import type { IshJoyi } from './ishJoyi';

export type TomonProfil = {
  /** `t2_yonalish` kaliti. */
  yonalish: string;
  defaultIlovalar: readonly IlovaKod[];
  boshIshJoyi: IshJoyi;
  /** Kabinet sahifalari (Sahifa.kalit). */
  kabinetSahifalar: readonly string[];
};

export const TOMON_PROFILLARI: readonly TomonProfil[] = [];
