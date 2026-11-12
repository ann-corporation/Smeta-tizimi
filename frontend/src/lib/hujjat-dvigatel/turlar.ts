/**
 * hujjat-dvigatel/turlar.ts — «yagona hujjat dvigateli» (V3) tiplari.
 *
 * Bu YANGI jadval yoki parallel oqim emas: mavjud hujjatlarni (F2, Forma-3, АОСР, M-29 …) BITTA tavsif reestrida
 * ro'yxatdan o'tkazadi — shablon/eksportyor, majburiy maydonlar va ularning avto-to'ldirish manbai, eksportdan oldingi
 * tekshiruv, hayot sikli, kim imzolaydi/tasdiqlaydi, taqdim resursi (t2_tomon_resurs) va token narxi kaliti.
 * Taqdim/qaror/arxiv — mavjud t2_tomon_taqdim / t2_tomon_qaror_v1 (bu yerda faqat holat nomlari moslashtiriladi).
 */

/** Hujjat turi kaliti (reestr kaliti). */
export type HujjatKalit =
  | 'f2' | 'forma3' | 'aosr' | 'm29' | 'nakopitelniy' | 'ostatka' | 'slichitelniy'
  | 'lab_protokol' | 'predpisaniya' | 'akt_osvidetelstvovaniya' | 'soprovod_xat' | 'zayavka';

/** Tomon rollari (t2_yonalish / hujjat-aylanish zanjir kalitlari bilan bir xil). */
export type TomonRol = 'pudratchi' | 'subpudratchi' | 'buyurtmachi' | 'texnadzor' | 'loyihachi' | 'laboratoriya' | 'yetkazuvchi' | 'ekspertiza';

/** Hayot sikli: qoralama → tekshiruv → yuborildi → qaror → arxiv. */
export type HujjatBosqich = 'qoralama' | 'tekshiruv' | 'yuborildi' | 'qaror' | 'arxiv';
/** Qaror natijasi (t2_tomon_qaror_v1): faqat QARSHI tomon chiqaradi. */
export type QarorNatija = 'qabul' | 'tuzatish' | 'rad';

/** Maydon qiymati qayerdan avtomatik to'ldiriladi. 'qolda' — odam kiritadi (tizim o'ylab topmaydi). */
export type AvtoManba = 'obyekt' | 'shartnoma' | 'kompaniya' | 'tomon' | 'f2' | 'fakt' | 'smeta' | 'hisob-yadro' | 'laboratoriya' | 'qolda';
export type MajburiyMaydon = { kalit: string; nom: string; manba: AvtoManba };

/** Eksportdan oldingi tekshiruv qadami. Hech biri hujjatni BLOKLAMAYDI (holat ko'rsatadi) — mavjud xulq saqlanadi. */
export type TekshiruvDaraja = 'obyekt' | 'shartnoma';
export type TekshiruvQadam = { kalit: string; nom: string; daraja: TekshiruvDaraja; hujjat: HujjatKalit | null };

export type EksportManbai = { modul: string; izoh: string };

/** Taqdim (qarshi tomonga rasmiy yuborish): t2_tomon_resurs kaliti + manba jadvali (bo'lsa). */
export type TaqdimTavsif = { resurs: string; manbaJadval: string | null };

export type HujjatTuri = {
  kalit: HujjatKalit;
  nom: string;
  nomRu: string;
  /** 'ishlaydi' — eksportyori kodda bor; 'rejada' — faqat reja (eksportyor yo'q). */
  holat: 'ishlaydi' | 'rejada';
  eksport: EksportManbai | null;
  majburiy: readonly MajburiyMaydon[];
  /** Eksportdan oldingi tekshiruv qadamlari (TAYYORGARLIK_QADAMLARI kalitlari). Eksportyorli turda bo'sh bo'lmasligi shart. */
  tekshiruv: readonly string[];
  /** Hayot sikli: odatiy oqim bosqichlari (taqdim yo'q turda 'yuborildi'/'qaror' yo'q). */
  bosqichlar: readonly HujjatBosqich[];
  imzo: { tayyorlaydi: TomonRol; tasdiqlaydi: readonly TomonRol[] };
  taqdim: TaqdimTavsif | null;
  /** Token narxi kaliti (hujjatTokenBilan({hujjat})). null — hozircha pullik yo'l yo'q (sababi tokenYoq da). */
  tokenKalit: string | null;
  tokenYoq?: string;
};
