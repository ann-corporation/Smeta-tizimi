/** Client for /api/smeta-ai (Smetachi AI worker — proposals only). */
import type { IshNiyati, SuhbatJavobi, SuhbatXabari, Tanlov, TanlovSorovi } from '../lib/smeta-ai/protokol';

export type AiXato = { ok: false; code: string; message?: string };
async function post<T>(body: unknown): Promise<T | AiXato> {
  try {
    const r = await fetch('/api/smeta-ai', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => null) as T | AiXato | null;
    return j ?? { ok: false, code: 'NETWORK' };
  } catch { return { ok: false, code: 'NETWORK' }; }
}
export const smetachiSuhbat = (kompaniyaId: number, xabarlar: SuhbatXabari[], ishlar: IshNiyati[], obyekt: string) =>
  post<{ ok: true; model: string; xom?: string } & SuhbatJavobi>({ amal: 'suhbat', kompaniya_id: kompaniyaId, xabarlar, ishlar, obyekt });
export const smetachiTanla = (kompaniyaId: number, sorovlar: TanlovSorovi[]) =>
  post<{ ok: true; tanlovlar: Tanlov[] }>({ amal: 'tanla', kompaniya_id: kompaniyaId, sorovlar });
