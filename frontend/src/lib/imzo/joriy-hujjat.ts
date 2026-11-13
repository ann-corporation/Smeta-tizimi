/** lib/imzo/joriy-hujjat.ts - foydalanuvchi hozir ko'rib turgan hujjat (Jarvis «imzo qo'y» shu hujjat bilan imzolash sahifasini ochadi). Kichik, bog'liqliksiz. */
let joriy: number | null = null;
export function joriyHujjatOrnat(id: number | null): void { joriy = id !== null && Number.isSafeInteger(id) && id > 0 ? id : null; }
export const joriyHujjatOl = (): number | null => joriy;
/** «imzo qo'y / imzola / подпиши / sign this» iborasi. */
export const IMZO_QOY_RE = /(^|\s)(imzo\s*qo['‘’ʻ`´]?y[\p{L}]*|imzola[\p{L}]*|подпиш[\p{L}]*|поставь\s+подпись|sign\s+(this|the)?\s*(document|doc|file)?)(\s|$)/iu;
export const imzolashUrl = (hujjatId: number): string => `/admin/imzo?bolim=imzolash&hujjat=${hujjatId}&imzola=1`;