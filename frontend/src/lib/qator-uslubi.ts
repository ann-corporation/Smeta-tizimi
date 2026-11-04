/**
 * Hujjat qatorlarining DARAJA bo'yicha uslubi (egasi qoidasi): BL (ish) - qalin; RS (resurs) - kursiv, ochroq;
 * MAT va OB - qalin. Bo'lim sarlavhasi o'zgarmaydi. Bitta joy: markaziy uslub tizimi (hujjat-yozuvchi) tayyor bo'lgach
 * faqat shu funksiya almashtiriladi. «Тип» (BL/RS/MAT/OB) belgisi ustun sifatida CHIQARILMAYDI (texnik ustunlar yashirin).
 */
import type { QatorRangi, RasmiyQatorTuri } from './hujjat-yozuvchi/rasmiy';

export type ResursTuri = 'rs' | 'mat' | 'ob';
export function bargUslubi(tur: ResursTuri | null | undefined): { tur: RasmiyQatorTuri; rang: QatorRangi | null } {
  if (tur === 'mat' || tur === 'ob') return { tur: 'ish', rang: null }; // qalin, fonsiz
  if (tur === 'rs') return { tur: 'oddiy', rang: 'almashtirilgan' }; // kursiv, kulrang (ochroq)
  return { tur: 'oddiy', rang: null };
}