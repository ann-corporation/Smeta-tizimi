/**
 * Jarvis VOSITA ta'rifi — yagona naqsh. Har vosita: id, tavsif, parametr sxemasi, kerakli ruxsat, o'qish|yozish, pulmi/hujjatmi, bajaruvchi.
 * Bajaruvchi — MAVJUD shlyuz amali/RPC (bevosita bazaga yozilmaydi, aktor sessiyadan serverda qo'yiladi: vositaga aktor parametri YO'Q).
 * Yozuv vositalari taklif kartasi qaytaradi; bajarish faqat foydalanuvchi tasdig'idan keyin (pul/hujjat — ikkinchi «Tasdiqlayman»),
 * operation_id taklif tuzilganda bir marta yaratiladi (qayta bosish takror yozmaydi).
 * Amal reestri (#399) kelganda `Vosita` shu shaklda reestr yozuvidan hosil qilinadi (`reestrdanVosita` chok nuqtasi).
 */
import type { KimMalumot } from '../kim';
import type { MoslashQutisi } from '../../../api/t2-moslash';
import type { ObyektQisqa } from '../kontekst-ajrat';
import type { YordamchiSahifa } from '../sahifa-qidiruv';

export type ParamTur = 'matn' | 'son' | 'sana' | 'tanlov';
export type ParamSxema = Record<string, { tur: ParamTur; majburiy?: boolean; izoh: string }>;

/** Mavjud shlyuz funksiyalari (haqiqiy yoki test). Hech qaysisida aktor parametri yo'q. */
export type VositaApi = {
  bugun: () => Promise<Array<{ nom: string; soni: number; yol?: string }>>;
  solishtiruv: (obyektId: number | null) => Promise<{ ok: true; hisob: { yuqori_ochiq: number; ochiq: number; tushuntirildi: number }; royxat: Array<{ nom: string; tavsif: string; jiddiylik: string; obyekt_nom: string | null; havola: string }> } | { ok: false; error: string }>;
  aktlar: (obyektId: number) => Promise<Array<{ id: number; raqam: string | null; oy: string; holat: string; versiya: number; lifecycle_status?: string }> | null>;
  aktTasdiqla: (aktId: number, versiya: number, operationId: string) => Promise<{ ok: boolean; error?: string }>;
  aktBekorQoralama: (aktId: number, sabab: string, versiya: number) => Promise<{ ok: boolean; error?: string }>;
  aktBekorLifecycle: (aktId: number, versiya: number, sabab: string, operationId: string) => Promise<{ ok: boolean; error?: string }>;
  shartnomalar: () => Promise<Array<{ id: number; raqam: string; nom: string | null }> | null>;
  tolovYoz: (p: { shartnomaId: number; summa: number; tur: 'avans' | 'tolov' | 'qaytarim'; sana: string; obyektId?: number; izoh?: string; operationId: string }) => Promise<{ ok: boolean; error?: string }>;
  xarajatYoz: (p: { obyektId: number | null; sana: string; kat: string; summa: number; izoh?: string; operationId: string }) => Promise<{ ok: boolean; error?: string }>;
  aloqalar: () => Promise<Array<{ id: number; nom: string; rol: string; faol: boolean }> | null>;
  murojaatTurlari: () => Promise<Array<{ kalit: string; nom: string }> | null>;
  murojaatYarat: (p: { aloqaId: number; turi: string; sarlavha: string; matn: string; obyektId?: number | null }) => Promise<{ ok: boolean; error?: string }>;
  taqdimResurslari: () => Promise<Array<{ kalit: string; nom: string }> | null>;
  taqdimYubor: (p: { aloqaId: number; resurs: string; manbaId: number; operationId?: string }) => Promise<{ ok: boolean; error?: string }>;
  /** Slichitelniy / tayyorlik (RPC t2_aosr_slichitelniy_v1, #413): RPC yo'q bo'lsa null (halol «tez orada»). */
  slichitelniy: (obyektId: number) => Promise<{ matn: string } | null>;
  /** Xotira (t2_agent_xotira, 3 daraja): o'qish va yozish; mazmun '-' bo'lsa o'chiriladi. */
  xotiraOl: () => Promise<Array<{ daraja: 'foydalanuvchi' | 'kompaniya' | 'tizim'; kalit: string; mazmun: string }> | null>;
  xotiraYoz: (daraja: 'foydalanuvchi' | 'kompaniya', kalit: string, mazmun: string) => Promise<{ ok: boolean; error?: string }>;
  /** «Jarvis qila olmadi: <niyat>» — o'suvchi tizim friksiya sensoriga. */
  friksiya: (niyat: string) => void;
  /** PTO liniyasi (2026-11-14). Hammasi ixtiyoriy: yo'q bo'lsa vosita halol «hozircha yo'q» deydi. */
  /** Obyekt holati — SERVER summa paketi (`_t2_summa_paket_v1`: svod/yaxlit hisobga olingan); mijozda qayta hisoblanmaydi. null — o'qilmadi. */
  obyektHolat?: (obyektId: number) => Promise<ObyektHolatMalumot | null>;
  /** F2 ni tasdiqlashga yuborish (lifecycle draft -> submitted, expected_version bilan, operation_id bilan takrorsiz). */
  f2TasdiqgaYubor?: (aktId: number, versiya: number, operationId: string) => Promise<{ ok: boolean; error?: string }>;
  /** AI ishchilar (fon): ro'yxat, inbox, topshirish (mavjud /api/ai-ishchi oqimi). null — o'qilmadi. */
  ishchilar?: () => Promise<IshchiQisqa[] | null>;
  ishchiNatijalari?: () => Promise<IshchiNatijaQisqa[] | null>;
  ishchiTopshir?: (kod: string, operationId: string) => Promise<{ ok: boolean; error?: string }>;
  /** Moslash qutisi (kunlik avtomat tekshiruvlar, FAQAT o'qish). null — o'qilmadi. */
  moslash?: () => Promise<MoslashQutisi | null>;
  /** Slichitelniy sikli (mavjud `lib/slichitelniy-tsikl.ts`, hujjat bilan bir xil hisob): к доплате / к снятию yuki. null — hisoblanmadi. */
  slichitelniyHisob?: (obyektId: number) => Promise<TsiklHisob | null>;
  /** Tsikl qoralamasi (F-2 qoralama, TASDIQLANMAYDI): token mexanizmi bilan, operation_id bilan takrorsiz. */
  slichitelniyYarat?: (p: { obyektId: number; tur: 'doplata' | 'snyatie'; oy: string; raqam: string; operationId: string }) => Promise<{ ok: boolean; error?: string }>;
  /** Obyekt smeta qatorlaridan qidirish (kod/nom bo'laklari bo'yicha, ≤ 6). */
  qatorTop?: (obyektId: number, matn: string) => Promise<QatorQisqa[] | null>;
  /** Zamena / qo'shimcha ISH saqlash (mavjud sb-yoz: zamena_ish_yarat_v1 / qoshimcha_ish_yarat_v1). Asl smeta qatori o'zgarmaydi. */
  zamenaSaqla?: (p: { obyektId: number; rejim: 'zamena' | 'qoshimcha'; qator: QatorQisqa; nom: string; birlik: string; hajm: number; sabab: string; operationId: string }) => Promise<{ ok: boolean; error?: string }>;
};

export type TsiklHisob = { doplata: { soni: number; jami: number }; snyatie: { soni: number; jami: number }; sigmadi: number; nomalum: number };
export type QatorQisqa = { id: number; kod: string | null; nom: string; birlik: string | null; tur: string | null; otaId: number | null; versiya: number };

/** Server paketi uchligi: QQS bilan (asosiy) · ustamali (ИТОГО-4) · ustamasiz (прямые). null — noma'lum (0 emas). */
export type PaketUchlik = { qqs_bilan: number; ustamali: number; ustamasiz: number; narxsiz_soni?: number };
export type ObyektHolatMalumot = {
  nom: string;
  shartnoma: { raqam: string | null; qqs_bilan: number | null; umumiy: boolean } | null;
  smeta: PaketUchlik | null; fakt: PaketUchlik | null; f2: PaketUchlik | null;
  f2Qoralama: { qqs_bilan: number | null; soni: number };
  f3: { sotuv: number | null; soni: number } | null;
  tolangan: number | null; qarz: number | null;
  bajarilish: { fakt: number | null; f2: number | null; f3: number | null };
  signal: { soni: number; kritik: number };
  /** Server «diqqat» belgilari shu obyekt uchun (kod: soni). */
  diqqat: Array<{ kod: string; soni: number | null }>;
};
export type IshchiQisqa = { kod: string; nom: string; doira: 'kompaniya' | 'tizim'; yoqilgan: boolean; jadval: string; yangiNatija: number; oxirgiHolat: string | null; oxirgiVaqt: string | null };
export type IshchiNatijaQisqa = { ishchi: string; sarlavha: string; xulosa: string; holat: string; yaratildi: string };

export type VositaKont = {
  kompaniyaId: number;
  kim: KimMalumot;
  obyekt: ObyektQisqa | null;
  obyektlar: readonly ObyektQisqa[];
  sahifalar: readonly YordamchiSahifa[];
  /** Joriy obyekt smeta qatorlaridan qidirish (motor vositasi qidir): zamena/qo'shimcha ishda «mavjud qator avval» qoidasi. */
  qidir?: (arg: string) => Promise<string>;
  api: VositaApi;
  opId: () => string;
  bugun?: Date;
};

export type Variant = { nom: string; matn: string };
/** Aniqlashtirish holati: foydalanuvchining keyingi xabari shu vositaning kutilgan parametriga javob. */
export type Davom = { id: string; slotlar: Record<string, unknown>; kutilgan: string };

export type VositaJavob =
  | { tur: 'javob'; matn: string; havolalar?: Array<{ yol: string; nom: string }>; xato?: boolean }
  | { tur: 'savol'; matn: string; variantlar?: Variant[]; davom: Davom }
  | { tur: 'taklif'; matn: string; nom: string; izoh: string; pul: boolean; bajar: () => Promise<string[]> };

export type Slot = Record<string, unknown> & { __javob?: string; __kutilgan?: string };

export type Vosita = {
  id: string;
  tavsif: string;
  parametrlar: ParamSxema;
  /** Kerakli capability (kim.ruxsatlar da bo'lsa tekshiriladi; asosiy tekshiruv serverda). null — ruxsat talab qilinmaydi. */
  ruxsat: string | null;
  tur: 'oqish' | 'yozish';
  pul: boolean;
  hujjat?: boolean;
  /** Mahalliy moslik: normallashgan so'zlar (sozlar) va xom matn bo'yicha. */
  mos: (t: readonly string[], xom: string) => boolean;
  ishla: (c: VositaKont, slot: Slot, xom: string) => Promise<VositaJavob>;
};
