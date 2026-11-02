/**
 * SMETA VERSIYASI → FARQ → DA'VO (PTO-CORE-001, 1-bosqich; egasi 2026-10-26) — umumiy turlar.
 * Bazadagi jadvallar: t2_smeta_versiya / _pozitsiya / _moslik (migratsiya 20261111100000).
 * Qonunlar: asl smeta CONST (t2_qator ga yozilmaydi); NULL ≠ 0; pul — NDS siz, ustamasiz + ustamali (kaskad), NDS oxirida.
 */

export type VersiyaTur = 'dastlabki' | 'ekspertizaga_topshirilgan' | 'ekspertiza' | 'korrektirovka' | 'boshqa';
export type MoslikHolat = 'ozgarmagan' | 'kamaygan' | 'oshgan' | 'almashtirilgan' | 'ochirilgan' | 'yangi' | 'noaniq';
export type Tasdiq = 'avto' | 'kutilmoqda' | 'tasdiqlandi' | 'rad';
export type Qaror = 'kutilmoqda' | 'qurilgan' | 'qurilmagan' | 'qisman';

/** Pozitsiya resursi (LRV 1.1, 1.2 …): hajm — pozitsiya bo'yicha JAMI (norma × ish hajmi). */
export type VResurs = { kod: string | null; nom: string | null; birlik: string | null; norma: number | null; hajm: number | null };

/** Tashqi versiya pozitsiyasi (LRV ish qatori yoki mustaqil material/uskuna). */
export type VPozitsiya = {
  tartib: number;
  lsKod: string | null; lsNom: string | null; razdel: string | null; blok: string | null;
  raqam: string | null; kod: string | null; nom: string; birlik: string | null; hajm: number | null;
  resurslar: VResurs[];
  manba?: { fayl?: string; varaq?: string; qator?: number } | null;
};

/** Joriy smeta pozitsiyasi (t2_qator: bl yoki bo'lim ostidagi mustaqil mat/ob). */
export type JPozitsiya = {
  qatorId: number;
  lsKod: string | null; lsNom: string | null; razdel: string | null; blok: string | null;
  kod: string | null; nom: string; birlik: string | null; hajm: number | null;
  tur: string;
  /** Smetaga keyin qo'shilgan (AddRepl: qo'shimcha ish / zamena) qator — ekspertiza smetasining qismi emas. */
  qoshimcha: boolean;
  /** Narxlash uchun resurslar (bl ostidagi rs/mat/ob; mustaqil mat/ob — o'zi). */
  resurslar: VResurs[];
};

/** Moslash dvigateli taklifi (indekslar — kirish massivlaridagi o'rni). */
export type MoslikTaklif = {
  eski: number | null;
  joriy: number | null;
  holat: MoslikHolat;
  /** 0..100; juft bo'lmasa null. */
  ishonch: number | null;
  usul: string;
  birlikFarq: boolean;
};

/** Bazadan o'qilgan versiya sarlavhasi. */
export type SmetaVersiya = {
  id: number; kompaniya_id: number; obyekt_id: number; nom: string; tur: VersiyaTur;
  manba_sana: string | null; manba_fayllar: Array<{ nom?: string; hajm?: number }>;
  bazaviy_revision_id: number | null; holat: 'yuklanmoqda' | 'tayyor' | 'bekor';
  pozitsiya_soni: number; izoh: string | null; yaratildi: string; yangilandi: string;
};

/** Bazadan o'qilgan pozitsiya qatori. */
export type PozitsiyaQator = {
  id: number; versiya_id: number; tartib: number;
  ls_kod: string | null; ls_nom: string | null; razdel: string | null; blok: string | null; raqam: string | null;
  kod: string | null; nom: string; birlik: string | null; hajm: number | string | null; resurslar: VResurs[] | null;
};

/** Bazadan o'qilgan moslik qatori. */
export type MoslikQator = {
  id: number; versiya_id: number; pozitsiya_id: number | null; qator_id: number | null;
  holat: MoslikHolat; ishonch: number | null; usul: string | null; birlik_farq: boolean;
  eski_hajm: number | string | null; joriy_hajm: number | string | null;
  joriy_kod: string | null; joriy_nom: string | null; joriy_birlik: string | null;
  tasdiq: Tasdiq; qaror: Qaror; qurilgan_hajm: number | string | null; qaror_izoh: string | null;
  qaror_vaqt: string | null; versiya: number;
};

export const son = (x: unknown): number | null => {
  if (x == null || x === '') return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};
