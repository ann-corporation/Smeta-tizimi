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
  /** Exact OOXML numeric text when the binary reader provides it. */
  numericText?: Array<Array<string | null | undefined>>;
}

/**
 * tn·km perevozka hisobi qatori (`трансп.`/`Лист2`: № | material | birlik | miqdor | tonna | masofa | tn·km | narx | summa).
 * Har qiymat hujjatdan aynan; bo'sh katak null (NULL ≠ 0). Arifmetika faqat TEKSHIRADI, hech narsa to'ldirmaydi.
 */
export interface TransportQatori {
  tartib: string;
  /** Material nomi — asl matn. */
  xom: string;
  birlik: string | null;
  miqdor: number | null;
  tonna: number | null;
  masofa: number | null;
  tnKm: number | null;
  narx: number | null;
  summa: number | null;
  /** tonna × masofa ≈ tn·km; tn·km × narx ≈ summa. null — tekshirib bo'lmadi (qiymat yo'q). */
  isbot: { tnKm: boolean | null; summa: boolean | null };
  manzil: Manzil;
}

/** Erkin hisob varag'i (transport, perevozka, shefmontaj…): resursga bo'linmaydi. */
export interface ErkinVaraq {
  fayl: string;
  varaq: string;
  /** `perevozka_res` — sarlavhasiz bitta guruhli perevozka RES (`16.Перевоз`): resurslari `VaraqAnatomiyasi.vedomost` da. */
  rol: 'transport' | 'erkin' | 'perevozka_res';
  /** Oxirgi ИТОГО/ВСЕГО qatoridagi summa; topilmasa null (0 EMAS). */
  yakuniy: { xom: string; qiymat: number; manzil: Manzil } | null;
  /** Shu summani o'qiydigan svod qatori (formula yoki qiymat tengligi). */
  svodQatori: { xom: string; manzil: Manzil; dalil: Dalil } | null;
  /** tn·km varag'ining material qatorlari (faqat `transport`, ustunlar tanilsa). */
  qatorlar?: TransportQatori[];
  /** Qatorlar summasi yig'indisi (null summalar qo'shilmaydi) va u ИТОГО bilan tengmi (≤ 0,5%). */
  qatorlarJami?: number | null;
  jamiMos?: boolean | null;
  /** Operator qarori: yaxlit qator / svodga / ilova. Modul o'zi tanlamaydi. */
  holat: 'kutmoqda';
}

/**
 * Moddali svod qatori (`сводн.`, `свод`, `Лист1`, `Форма`, `_СТАРТ`). Smetaga AVTOMATIK qo'shilmaydi — operator tanlaydi.
 *  - `lokal` — svod jadvalidagi lokal smeta/obyekt qatori («Наименование смет»);
 *  - `modda` — xarajat moddasi (ЗАТРАТЫ НА…, материалы, ЭММ…);
 *  - `foiz` — foizli ustama («-18,0%», «0,4% С К=0,8»);
 *  - `xat_lumpsum` — «согласно письмо заказчика от … №…» yaxlit summa;
 *  - `jami` — ИТОГО/ВСЕГО; `nds` — НДС qatori; `snijenie` — «заявленная / снижения / завышена»;
 *  - `buyurtmachi_xarajati` — заказчик / фонд «Шаффоф» / кадастр / проект.
 */
export type SvodQatorTuri = 'lokal' | 'modda' | 'foiz' | 'xat_lumpsum' | 'jami' | 'nds' | 'snijenie' | 'buyurtmachi_xarajati';

export interface SvodQiymat {
  /** 1-asosli ustun va uning sarlavhasi (asl matn, KATTA harfda). */
  ustun: number;
  sarlavha: string;
  qiymat: number;
  /** Ustun sarlavhasidagi birlik: 1000 — «тыс.сум», 1 — so'm, null — pul emas yoki noma'lum (чел-час). */
  masshtab: 1 | 1000 | null;
  /** Ustun «с НДС» (true) / «без НДС» (false) / noma'lum (null). Formula boshqa svod katagini o'qisa — o'sha ustundan. */
  ndsBilan: boolean | null;
  formula?: string;
}

export interface SvodQatori {
  tur: SvodQatorTuri;
  xom: string;
  tartib: string | null;
  manzil: Manzil;
  qiymatlar: SvodQiymat[];
  /** Asosiy summa (svod «Всего с НДС» / «Цена» / «Стоимость» ustuni; bo'lmasa birinchi pul qiymati). Yo'q — null. */
  summa: SvodQiymat | null;
  foiz?: { foiz: number; koef: number | null; dalil: string };
  xat?: { raqam: string; sana: string | null };
  /** Asosiy summa katagi formulasi boshqa varaqni o'qisa — birinchi havola. */
  bogLanish?: { varaq: string; katak: string };
  /** Summa shu kitobdagi boshqa svod qatoridan formula bilan olingan (`сводн!C16 = свод!O20`) — ikki marta sanalmasin. */
  nusxa?: { varaq: string; qator: number };
}

export interface SvodVaraq {
  fayl: string;
  varaq: string;
  /** `modda` — moddali svod; `obyekt_royxati` — ABC4 CB_DET2 (obyekt → lokal, `svodniOqi`). */
  shakl: 'modda' | 'obyekt_royxati';
  qatorlar: SvodQatori[];
  /** Svoddan aniqlangan НДС stavkasi (0,12) — `*1.12` formula yoki «НДС 12%» yorlig'idan; topilmasa null. */
  nds: { stavka: number; dalil: string } | null;
  review: ReviewBand[];
  /** Operator qarori: svod qatorlari smetaga o'zi yozilmaydi. */
  holat: 'kutmoqda';
}

/** «Bo'sh import» darvozasi: varaqda sonli qatorlar bor, lekin hech bir shakl o'qimadi. */
export interface TushunilmaganVaraq {
  fayl: string;
  varaq: string;
  rol: VaraqRoli;
  sonliQatorlar: number;
  /** Eng katta ИТОГО/ВСЕГО summasi (bo'lmasa varaqdagi eng katta son) — yo'qotilishi mumkin bo'lgan pul. */
  engKattaSumma: { qiymat: number; yorliq: string; manzil: Manzil } | null;
  taklif: string;
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
  /** LRV_PLUS texnik satr turi. Ma'no aynan saqlanadi; suffiks biznes holati deb talqin qilinmaydi. */
  texnikBelgi?: string | null;
  /** Mustaqil mat/ob qatori tegishli bo'lgan eng yaqin RZ. */
  sarlavha?: number | null;
  /** Tizim1 marker: "+" qo'shimcha, "~" zamena. */
  belgi?: 'qoshimcha' | 'zamena';
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
  /** LRV_PLUS texnik satr turi; suffixlar faqat manba belgisi sifatida saqlanadi. */
  texnikBelgi?: string | null;
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
  /** Operator hal qilmaguncha natijani ishonchli deb bo'lmaydi (masalan qo'llab-quvvatlanmaydigan БЕЗ СКЛАД bloki). */
  bloklovchi?: boolean;
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
  /** LRV ichidagi RZ darajasida turgan mustaqil MAT/OB yoki egasiz RS qatorlari. */
  mustaqilResurslar?: Resurs[];
  /** Ish daraxtidan keyingi ВЕДОМОСТЬ РЕСУРСОВ yoki RES varag'i qatorlari. */
  vedomost: Resurs[];
  jamilar: JamiQator[];
  /** F2 podvalidagi СУМ hisob satrlari (nom + summa; № va shifr yo'q) — xom, hech narsa taxmin qilinmaydi. */
  podvalSatrlar?: JamiQator[];
  review: ReviewBand[];
  /** Xaritaga kirmagan sarlavhali ustunlar (PTO qo'shgan: ПРИМЕЧАНИЕ, ОСТАТОК…) —
   * o'qilmaydi, operatorga ko'rsatiladi. */
  qoshimchaUstunlar?: Array<{ ustun: number; sarlavha: string }>;
  /** Varaq profili (imzo → rol/format/ustunlar) — korpus manifesti va kelajakda
   * kompaniya profillari uchun (§6). */
  profil?: import('./profil').VaraqProfili;
}
