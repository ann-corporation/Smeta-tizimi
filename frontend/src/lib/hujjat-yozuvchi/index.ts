/**
 * hujjat-yozuvchi — PTO hujjatlarini yozuvchi yagona modul.
 *
 * Standart: docs/architecture/HUJJAT_STANDARTI_V1.md (H1–H9).
 *   - Asl hujjatni DAVOM ettirish (H1): `varaqXaritasi` → `varaqniPatchla`,
 *     `boshUstun`, `colsYoz`, `formulaKochir`, `xfNusxa`, `printAreaKengaytir`.
 *   - Noldan rasmiy hujjat (H2–H9): `RasmiyVaraq` + `rasmiyKitob`.
 *   - Imzo (H3): `imzoTomonlari`, `imzoMatni`.
 *   - Fayl nomi (H8): `hujjatFaylNomi`.
 *   - Tekshiruv (testlar uchun): `hujjatTekshir`.
 */
export * from './ooxml';
export * from './uslub';
export * from './varaq';
export * from './formula';
export * from './kitob';
export * from './imzo';
export * from './fayl-nomi';
export * from './rasmiy';
export * from './propis';
export * from './korinish';
export { hujjatTekshir, imzoRollariBormi, TAQIQLANGAN_QOIDALAR, type HujjatHisobot, type TekshirVaraq, type TaqiqlanganTopilma } from './tekshir';
