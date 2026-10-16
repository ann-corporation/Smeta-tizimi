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
/**
 * Company memory of the estimator (owner 2026-10-16: "xato qilsa foydalanuvchi bilan gaplashib, shu foydalanuvchi uchun context yig'ib
 * borsin"): lessons are stored in the existing agent memory (t2_agent_xotira, key "smeta.*", shared with the company's other agents).
 */
export type XotiraYozuv = { kalit: string; mazmun: string; yangilandi?: string };
export async function smetaXotirasi(kompaniyaId: number): Promise<XotiraYozuv[]> {
  try {
    const r = await fetch(`/api/agent-ish?bolim=muhit&kompaniya_id=${kompaniyaId}`, { credentials: 'same-origin' });
    const j = await r.json().catch(() => null) as { xotira?: XotiraYozuv[] } | null;
    return (j?.xotira ?? []).filter(x => x.kalit.startsWith('smeta.') && x.mazmun && x.mazmun !== '-');
  } catch { return []; }
}
export async function smetaXotiraYoz(kompaniyaId: number, mazmun: string, kalit?: string): Promise<boolean> {
  const k = kalit ?? `smeta.${[...mazmun].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0, 7).toString(36)}`;
  try {
    const r = await fetch('/api/agent-ish', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amal: 'xotira_yoz', kompaniya_id: kompaniyaId, kalit: k, mazmun: mazmun.slice(0, 1500) }) });
    const j = await r.json().catch(() => null) as { ok?: boolean } | null;
    return !!j?.ok;
  } catch { return false; }
}
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
