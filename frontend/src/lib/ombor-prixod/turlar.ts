export type PrixodXato = 'SANA_YOQ' | 'SANA_XATO' | 'NOM_YOQ' | 'BIRLIK_YOQ' | 'MIQDOR_YOQ' | 'MIQDOR_XATO' | 'MIQDOR_SANA';
export type PrixodOgoh = 'YETKAZUVCHI_YOQ' | 'MIQDOR_FORMULA' | 'NOM_SARLAVHASI' | 'RAQAM_YOQ';
export type PrixodQator = {
  manbaQator: number; manbaRaqam: string | null;
  sana: string | null; nom: string; birlik: string; miqdor: number | null;
  miqdorMatni: string; tur: string; yetkazuvchi: string; hujjat: string;
  narx: null; summa: null; qqs: null;
  kalit: string | null; holat: 'yangi' | 'takror' | 'xato';
  xatolar: PrixodXato[]; ogohlar: PrixodOgoh[];
};
export type PrixodKitob = {
  faylNomi: string; sha256: string; varaq: 'Приход'; sarlavhaQator: number;
  kompaniyaId: number; skladId: number | null;
  takrorTekshirildi: boolean;
  qatorlar: PrixodQator[]; otkazilganVaraqlar: string[];
  boshQatorlar: number; ogohlar: PrixodOgoh[];
  nomTakliflari: Array<{ nomlar: string[]; qatorlar: number[] }>;
  jami: { yangi: number; takror: number; xato: number; ogohli: number };
};
export type PrixodOpsiya = {
  faylNomi: string; kompaniyaId: number; skladId: number | null;
  oldingiKalitlar?: readonly string[];
};
