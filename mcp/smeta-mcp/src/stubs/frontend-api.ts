/**
 * Node stubi: frontend/src/api/supabase.ts (brauzerdan /api/... ga fetch). MCP bazaga o'zi ulanadi, shuning uchun
 * frontend sof mantig'i orqali bu funksiyalar chaqirilsa — aniq xato (jim muvaffaqiyat emas).
 */
const yoq = (nom: string) => (): never => {
  throw new Error(`MCP: frontend API «${nom}» Node'da mavjud emas (bazaga MCP o'zi ulanadi).`);
};
export const sbOqi = yoq('sbOqi');
export const sbT2F2ImportDraftRoyxat = yoq('sbT2F2ImportDraftRoyxat');
export const sbT2F2ImportDraftSaqla = yoq('sbT2F2ImportDraftSaqla');
export const sbT2F2ImportJobHolat = yoq('sbT2F2ImportJobHolat');
export const sbT2F2ImportJobIlgarilash = yoq('sbT2F2ImportJobIlgarilash');
export const sbT2F2ImportJobYarat = yoq('sbT2F2ImportJobYarat');
export const sbT2AktBekor = yoq('sbT2AktBekor');
export const yozAmali = yoq('yozAmali');
export const yangiOperationId = (): string => globalThis.crypto.randomUUID();
export type T2Qator = {
  id: number; obyekt_id?: number; ota_id: number | null; daraja?: number | null; tartib?: number | null;
  tur: string | null; kod: string | null; nom: string | null; birlik: string | null;
  hajm: number | null; narx: number | null; kat: string | null; summa?: number | null;
  qoshimcha?: boolean | null; zamena?: boolean | null; versiya: number; norma?: number | null;
  [k: string]: unknown;
};
