/** Client for /api/smeta-ai (Smetachi AI worker — proposals only). */
import type { IshNiyati, KoefSorovi, KoefTanlov, KpOqish, NarxSorovi, NarxTanlov, SuhbatJavobi, SuhbatXabari, Tanlov, TanlovSorovi } from '../lib/smeta-ai/protokol';

export type AiXato = { ok: false; code: string; message?: string };
async function post<T>(body: unknown): Promise<T | AiXato> {
  try {
    const r = await fetch('/api/smeta-ai', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => null) as T | AiXato | null;
    return j ?? { ok: false, code: 'NETWORK' };
  } catch { return { ok: false, code: 'NETWORK' }; }
}
/** `smeta` — the estimate being built as text (lib/smeta-studio/ai-kontekst), so the model reads the whole draft. */
export const smetachiSuhbat = (kompaniyaId: number, xabarlar: SuhbatXabari[], ishlar: IshNiyati[], obyekt: string, smeta?: string,
  fayl?: { mimeType?: string; data?: string; nom: string; matn?: string } | null) =>
  post<{ ok: true; model: string; xom?: string; tushunildi?: boolean; ogohlantirish?: string } & SuhbatJavobi>({ amal: 'suhbat', kompaniya_id: kompaniyaId, xabarlar, ishlar, obyekt, smeta,
    ...(fayl?.matn ? { hujjat_matn: fayl.matn, hujjat_nom: fayl.nom } : fayl?.data ? { fayl: { mimeType: fayl.mimeType, data: fayl.data, nom: fayl.nom } } : {}) });
/** AI picks normative coefficients that match the stated work conditions (codes only from the list sent). */
export const smetachiKoefTanla = (kompaniyaId: number, sharoit: string, sorovlar: KoefSorovi[]) =>
  post<{ ok: true; tanlovlar: KoefTanlov[]; savol: string | null }>({ amal: 'koef_tanla', kompaniya_id: kompaniyaId, sharoit, sorovlar });
/** AI reads a КП / price list (PDF or image as base64, or table text). Nothing is stored by this call. */
export const smetachiKpOqi = (kompaniyaId: number, p: { fayl?: { mimeType: string; data: string }; matn?: string }) =>
  post<{ ok: true; kp: KpOqish; model: string }>({ amal: 'kp_oqi', kompaniya_id: kompaniyaId, ...p });
export const smetachiTanla = (kompaniyaId: number, sorovlar: TanlovSorovi[]) =>
  post<{ ok: true; tanlovlar: Tanlov[] }>({ amal: 'tanla', kompaniya_id: kompaniyaId, sorovlar });
/** AI picks a price candidate per resource among the ones the browser found (catalogue / company estimates). */
export const smetachiNarxTanla = (kompaniyaId: number, sorovlar: NarxSorovi[], hudud: string | null) =>
  post<{ ok: true; tanlovlar: NarxTanlov[] }>({ amal: 'narx_tanla', kompaniya_id: kompaniyaId, sorovlar, hudud });
