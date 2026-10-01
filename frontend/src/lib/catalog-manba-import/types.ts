import type { XlsxWorkbook } from '../f2-import-parse/xlsxReader';

/** Katalog manbasi — uchala tur bir-birining narxini almashtirmaydi. */
export type CatalogManbaTuri = 'material_katalog' | 'ish_haqi' | 'mashina_soat';
export type CatalogVaraqRoli = 'narx_jadvali' | 'ish_haqi_jadvali' | 'mashina_soat_jadvali' | 'qopqoq' | 'noma_lum';
export type CatalogNarxVarianti = 'nds_bilan' | 'nds_siz' | 'asosiy' | 'ijtimoiy_12' | 'ijtimoiy_25' | 'noma_lum';
export type CatalogValyuta = 'UZS' | 'USD' | 'noma_lum';

export type CatalogDavr = {
  yil: number | null;
  kvartal: 1 | 2 | 3 | 4 | null;
  yorliq: string;
  ishonch: 'yuqori' | 'o_rta' | 'past';
};

export type CatalogUstun = {
  indeks: number;
  sarlavha: string;
  varianti: CatalogNarxVarianti;
  sanasi: string | null;
};

export type CatalogQator = {
  sourceKey: string;
  varaqqa: string;
  manbaQatori: number;
  nom: string;
  birlik: string | null;
  kod: string | null;
  hudud: string | null;
  narx: number | null;
  narxVarianti: CatalogNarxVarianti;
  valyuta: CatalogValyuta;
  davr: CatalogDavr;
  izoh: string;
  ogohlantirishlar: string[];
};

export type CatalogVaraqTahlili = {
  nom: string;
  rol: CatalogVaraqRoli;
  sarlavhaQatori: number | null;
  ma_lumotBoshi: number | null;
  hudud: string | null;
  ustunlar: CatalogUstun[];
  qatorSoni: number;
  narxliQatorSoni: number;
  warnings: string[];
};

export type CatalogTahlil = {
  faylNomi: string;
  turi: CatalogManbaTuri | 'noma_lum';
  davr: CatalogDavr;
  varaqlar: CatalogVaraqTahlili[];
  qatorlar: CatalogQator[];
  warnings: string[];
  periodNizolari?: string[];
  importgaTayyor: boolean;
  /** Fayl identiteti uchun; row number canonical identity emas. */
  contentHash?: string;
};

export type MashinaSoatMatnQatori = {
  nom: string;
  birlik: string | null;
  narx: number | null;
  izoh?: string;
  sahifa?: number;
};

export type MashinaSoatMatnTahlili = {
  faylNomi: string;
  turi: 'mashina_soat';
  davr: CatalogDavr;
  qatorlar: MashinaSoatMatnQatori[];
  warnings: string[];
  importgaTayyor: boolean;
};

export type CatalogWorkbookLike = Pick<XlsxWorkbook, 'sheets' | 'sheet'>;
