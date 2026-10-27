/**
 * 1C akt-sverka importi — tizim tomoni ma'lumot shakllari (/api/sb `sverka_moslash_v1`, migratsiya 20261112400000).
 * Pul — so'mda (server numeric); hisob ichida tiyinga o'tkaziladi (nakopitelniy-svod `tiyin`).
 */
import type { TolovTur } from '../nakopitelniy-svod';

/** _t2_f2_ustamali natijasi: pryamye (ustamasiz), katsiz (kategoriyasiz, ustamaga kirmagan), ustamali (NDS siz) va podval. */
export type F2Ustama = {
  pryamye: number | null; katsiz: number | null; ustamali: number | null; narxsiz_qator?: number | null;
  podval: { itogo4?: number | null; nds?: number | null; vsego?: number | null } | null;
};
export type MoslashF2 = {
  akt_id: number; obyekt_id: number; oy: string | null; raqam: string | null; holat: string;
  /** t2_akt.hujjat_jami — bog'langan qatorlar PRYAMYE yig'indisi (hujjat jami EMAS). */
  hujjat_jami: number | null;
  ustama: F2Ustama | null;
};
export type MoslashF3 = {
  id: number; raqam: string | null; sotuv_sana: string; sotuv_summa: number; nds_foiz: number | null; holat: string; versiya: number;
  operation_id: string | null; akt_ids: number[];
};
export type MoslashReestr = {
  id: number; akt_id: number | null; raqam: string; lot: string | null; obyekt_ish: string | null; davr: string | null; oy: string | null;
  qqssiz: number | null; qqs: number | null; qqs_bilan: number | null; holat_matn: string | null; forma3_id: number | null; versiya: number;
};
export type TaqsimotQator = { obyekt_id: number | null; summa: number; manba: 'fifo' | 'qolda' };
export type MoslashTolov = {
  id: number; sana: string; summa: number; tur: TolovTur; izoh: string | null; hujjat_raqam: string | null; manba: string | null;
  obyekt_id: number | null; operation_id: string | null; versiya: number; taqsimot: TaqsimotQator[];
};
export type MoslashShartnoma = {
  id: number; raqam: string;
  f2: MoslashF2[]; f3: MoslashF3[]; f2_reestr: MoslashReestr[]; tolovlar: MoslashTolov[];
};
/** Shartnoma kartasi (shartnoma_svod_v1 dan): obyektlar va summa. */
export type TizimShartnoma = {
  id: number; raqam: string; jami_nds_bilan: number | null; obyektlar: { id: number; nom: string }[];
  /** Joriy summa (DS bilan), so'mda; noma'lum — null. */
  joriySumma: number | null;
};
