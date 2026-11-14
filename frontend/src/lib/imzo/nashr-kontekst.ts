/** lib/imzo/nashr-kontekst.ts - faol kompaniya (manba QR nashri uchun). Ataylab kichik: asosiy bundlega fflate/QR kirmasin. */
type Kontekst = { kompaniyaId: number | null };
let kontekst: Kontekst = { kompaniyaId: null };

/** React kontekstidan yoziladi. null - nashr o'chiq (global rejim yoki kirmagan). */
export function nashrKontekstOrnat(k: Kontekst): void { kontekst = k; }
export const nashrKompaniyasi = (): number | null => kontekst.kompaniyaId;
