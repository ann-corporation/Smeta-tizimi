/**
 * SMETA_ANATOMIYA_V1 — yagona smeta tushunish modulining chiqish modeli.
 * Kontrakt: docs/architecture/SMETA_ANATOMIYA_V1.md.
 *
 * Qonunlar: asl matn (`xom`) hech qachon o'zgarmaydi; har tugunda manzil bor;
 * bo'sh katak `null` (NULL ≠ 0); dalil yetmasa — `ishonch: 'past'` + review.
 */

export type Katak = string | number | boolean | null | undefined;

/** Kirish: istalgan o'quvchi (xlsxReader, SheetJS) shu shaklga keltiradi. */
export interface KirishVaraq {
  nom: string;
  rows: Katak[][];
  merges?: Array<{ r1: number; c1: number; r2: number; c2: number }>;
  /** Excel outline darajasi, 0-asosli qator indeksi bo'yicha (bo'lsa). */
  outline?: Array<number | undefined>;
  /** Formulalar setkasi (`=` siz), `rows` bilan bir xil indekslar (bo'lsa).
   *  Varaqlar orasidagi havola — bog'lanishning eng kuchli dalili. */
  formulalar?: Array<Array<string | null | undefined>>;
}

/** Erkin hisob varag'i (transport, perevozka, shefmontaj…): resursga bo'linmaydi. */
export interface ErkinVaraq {
  fayl: string;
  varaq: string;
  rol: 'transport' | 'erkin';
  /** Oxirgi ИТОГО/ВСЕГО qatoridagi summa; topilmasa null (0 EMAS). */
  yakuniy: { xom: string; qiymat: number; manzil: Manzil } | null;
  /** Shu summani o'qiydigan svod qatori (formula yoki qiymat tengligi). */
  svodQatori: { xom: string; manzil: Manzil; dalil: Dalil } | null;
  /** Operator qarori: yaxlit qator / svodga / ilova. Modul o'zi tanlamaydi. */
  holat: 'kutmoqda';
}
export interface KirishKitob {
  fayl: string;
  varaqlar: KirishVaraq[];
}

/** 1-asosli qator/ustun — Excel'dagi bilan bir xil, operator ko'rib topa oladi. */
export type Manzil = { fayl: string; varaq: string; qator: number; ustun?: number };

export type Ishonch = 'yuqori' | 'orta' | 'past';
export type Dalil = { qoida: string; ishonch: Ishonch; izoh: string };

export type VaraqRoli =
  | 'lrv'        // ish daraxti: ish (1,2..) + resurslar (1.1, 1.2..)
  | 'res'        // resurs ro'yxati (guruhlar: ТРУДОВЫЕ, МАШИНЫ, МАТЕРИАЛЫ..)
  | 'svod'       // svod / titul hisob-kitobi
  | 'transport'  // tn·km transport hisobi
  | 'erkin'      // sonli, lekin ma'lum shaklga tushmaydi (perevozka, shefmontaj..)
  | 'bosh';      // bo'sh yoki faqat matn

export type SarlavhaTuri = 'qurilish' | 'obyekt' | 'lokal' | 'razdel' | 'blok';

export interface Sarlavha {
  id: number;
  ota: number | null;
  daraja: number;          // 1 = ildiz
  tur: SarlavhaTuri;
  xom: string;             // asl matn, aynan
  belgi: string | null;    // "1.", "3.2.", "РАЗДЕЛ 1", "В)"
  manzil: Manzil;
  dalil: Dalil[];
}

export interface Resurs {
  tartib: string;
  kod: string | null;
  xom: string;
  birlik: string | null;
  normaBirlikka: number | null;
  hajm: number | null;
  narx: number | null;
  summa: number | null;
  /** Vedomost/RES dagi guruh sarlavhasi (ТРУДОВЫЕ РЕСУРСЫ, МЕСТНЫЕ МАТЕРИАЛЫ…), asl matn. */
  guruh: string | null;
  manzil: Manzil;
}

export interface Ish {
  tartib: string;
  shifr: string | null;
  xom: string;
  birlik: string | null;
  hajm: number | null;
  narx: number | null;
  summa: number | null;
  /** Eng yaqin sarlavha; ildizdan yo'l — `sarlavhaYoli()` bilan. */
  sarlavha: number | null;
  manzil: Manzil;
  resurslar: Resurs[];
  /** Tizim1 tur ustuni: "bl+"/"mat+" qo'shimcha ish, "~" zamena. */
  belgi?: 'qoshimcha' | 'zamena';
}

export interface UstunXaritasi {
  tartib: number;
  shifr: number;
  nom: number;
  birlik: number;
  hajmBirlikka: number;
  hajmLoyiha: number;
  narx: number;
  summa: number;
  /** 0-asosli: sarlavha bloki boshi va birinchi ma'lumot qatori. */
  sarlavhaQatori: number;
  malumotBoshi: number;
}

export interface JamiQator {
  xom: string;
  qiymat: number | null;
  manzil: Manzil;
}

export interface ReviewBand {
  kod: string;
  izoh: string;
  manzil?: Manzil;
}

export interface VaraqAnatomiyasi {
  fayl: string;
  varaq: string;
  rol: VaraqRoli;
  rolDalil: Dalil[];
  ustunlar: UstunXaritasi | null;
  titul: Sarlavha[];
  sarlavhalar: Sarlavha[];
  ishlar: Ish[];
  /** Ish daraxtidan keyingi ВЕДОМОСТЬ РЕСУРСОВ yoki RES varag'i qatorlari. */
  vedomost: Resurs[];
  jamilar: JamiQator[];
  review: ReviewBand[];
  /** Xaritaga kirmagan sarlavhali ustunlar (PTO qo'shgan: ПРИМЕЧАНИЕ, ОСТАТОК…) —
   * o'qilmaydi, operatorga ko'rsatiladi. */
  qoshimchaUstunlar?: Array<{ ustun: number; sarlavha: string }>;
  /** Varaq profili (imzo → rol/format/ustunlar) — korpus manifesti va kelajakda
   * kompaniya profillari uchun (§6). */
  profil?: import('./profil').VaraqProfili;
}
