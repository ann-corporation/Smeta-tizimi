/**
 * «AI smeta ustasi» — shartnomalar (docs/architecture/SMETA_USTASI_V1.md).
 *
 * Chegara: MODEL faqat matndan Scope (nima bor, qaysi o'lchamlar aytilgan, nima savol) chiqaradi.
 * Shablon tanlash, hajm formulasi, birlik tekshiruvi va IshNiyati hosil qilish — KOD (deterministik).
 * Model hech qachon: norma kodi, narx, hajm sonini o'ylab topmaydi.
 */
import type { Birlik } from '../smeta-ai/protokol';

export type OlchamManba = 'user' | 'assumed';

/** Foydalanuvchi aytgan (yoki model taxmin qilgan) bitta parametr. `value` — son yoki tanlov id'si. */
export type OlchamQiymat = { value: number | string; unit: string | null; source: OlchamManba };
export type ScopeElement = { id: string; source: OlchamManba };
export type ScopeSavol = { matn: string; variantlar: string[]; param?: string };

export type Scope = {
  elementlar: ScopeElement[];
  olchamlar: Record<string, OlchamQiymat>;
  taxminlar: string[];
  savollar: ScopeSavol[];
};

/** Parametr o'lchov turi → o'lcham darajasi (m=1, m2=2, m3=3, dona=0). */
export type ParamOlchov = 'm' | 'm2' | 'm3' | 'dona' | 'matn';
export type ParamVariant = { qiymat: string; yorliq: string; sinonimlar?: string[] };
export type ParamTavsif = {
  tur: 'son' | 'tanlov' | 'matn';
  olchov: ParamOlchov;
  tavsif: string;
  /** Foydalanuvchiga beriladigan savol (parametr yetishmasa). */
  savol: string;
  min?: number;
  max?: number;
  /** Faqat tanlov turi uchun. */
  variantlar?: ParamVariant[];
  /** Son turida foydalanuvchiga tavsiya qiymatlari (savolda variant sifatida, hech qachon avtomatik qo'llanmaydi). */
  tavsiya?: string[];
};

/** Shablon qoidasi: IF element bor VA `agar` shartlari to'g'ri THEN ish + hajm formulasi. */
export type ShablonQoida = {
  id: string;
  element: string;
  bolim: string;
  tavsif: string;
  /** 1–3 ta rus tilidagi normativ qidiruv ibora (ShNQ/ГЭСН uslubi). Norma KODI yozilmaydi. */
  qidiruv: string[];
  birlik: Birlik;
  /** Parametr nomlari bilan formula. null — joy-egasi (loyihadan aniqlanadi). */
  ifoda: string | null;
  /** Tanlov parametri sharti: {param: [qiymatlar]}; barchasi bajarilishi shart. */
  agar?: Record<string, string[]>;
  /** Normativ to'plam ishorasi (E06...) — filtr emas, ishora. */
  toplam?: string[];
  material?: string | null;
  izoh?: string;
};

export type Shablon = {
  schema: 'smeta-ustasi-shablon-v1';
  id: string;
  nom: string;
  versiya: string;
  /** EGASI_TEKSHIRISHI_KERAK — egasi tasdiqlamaguncha qoralama. */
  holat: 'EGASI_TEKSHIRISHI_KERAK' | 'TASDIQLANGAN';
  izoh: string;
  elementlar: Array<{ id: string; yorliq: string }>;
  parametrlar: Record<string, ParamTavsif>;
  qoidalar: ShablonQoida[];
};

export type KengaytmaIshi = import('../smeta-ai/protokol').IshNiyati;
export type Kengaytma = {
  ishlar: KengaytmaIshi[];
  savollar: ScopeSavol[];
  /** Qoida qo'llanmadi: sabab (shart mos emas, hajm nol, formula xatosi). */
  otkazilgan: Array<{ qoida: string; sabab: string }>;
};
