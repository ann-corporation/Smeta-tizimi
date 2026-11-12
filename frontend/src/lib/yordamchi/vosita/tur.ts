/**
 * Jarvis VOSITA ta'rifi — yagona naqsh. Har vosita: id, tavsif, parametr sxemasi, kerakli ruxsat, o'qish|yozish, pulmi/hujjatmi, bajaruvchi.
 * Bajaruvchi — MAVJUD shlyuz amali/RPC (bevosita bazaga yozilmaydi, aktor sessiyadan serverda qo'yiladi: vositaga aktor parametri YO'Q).
 * Yozuv vositalari taklif kartasi qaytaradi; bajarish faqat foydalanuvchi tasdig'idan keyin (pul/hujjat — ikkinchi «Tasdiqlayman»),
 * operation_id taklif tuzilganda bir marta yaratiladi (qayta bosish takror yozmaydi).
 * Amal reestri (#399) kelganda `Vosita` shu shaklda reestr yozuvidan hosil qilinadi (`reestrdanVosita` chok nuqtasi).
 */
import type { KimMalumot } from '../kim';
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
  /** «Jarvis qila olmadi: <niyat>» — o'suvchi tizim friksiya sensoriga. */
  friksiya: (niyat: string) => void;
};

export type VositaKont = {
  kompaniyaId: number;
  kim: KimMalumot;
  obyekt: ObyektQisqa | null;
  obyektlar: readonly ObyektQisqa[];
  sahifalar: readonly YordamchiSahifa[];
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
