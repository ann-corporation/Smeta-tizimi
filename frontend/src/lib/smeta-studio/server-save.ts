/**
 * Client for the named server commands (/api/smeta-studio). One operation_id per logical
 * save attempt: a network retry reuses it (server replays the stored result), a new edit
 * gets a new one. Version conflicts are reported, never overwritten (no last-writer-wins).
 */
import type { EstimateDoc } from './model';

export type SaveResult =
  | { ok: true; versiya: number; yangilandi: string }
  | { ok: false; code: 'VERSION_CONFLICT'; versiya: number | null }
  | { ok: false; code: string };
type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
const post = (fetcher: Fetcher, body: unknown) => fetcher('/api/smeta-studio', {
  method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

export async function saveToServer(input: { kompaniyaId: number; obyektId: number | null; doc: EstimateDoc; expectedVersion: number; operationId: string },
  fetcher: Fetcher = (u, i) => fetch(u, i)): Promise<SaveResult> {
  let r: Response;
  try {
    r = await post(fetcher, { amal: 'saqla', kompaniya_id: input.kompaniyaId, obyekt_id: input.obyektId, draft_uid: input.doc.draftId,
      expected_version: input.expectedVersion, operation_id: input.operationId, hujjat: input.doc });
  } catch { return { ok: false, code: 'NETWORK' }; }
  let j: Record<string, unknown> = {};
  try { j = await r.json(); } catch { /* non-JSON */ }
  if (r.status === 404) return { ok: false, code: 'SERVER_NOT_ACTIVATED' };
  if (j.ok === true && Number.isInteger(j.versiya)) return { ok: true, versiya: j.versiya as number, yangilandi: String(j.yangilandi ?? '') };
  if (j.code === 'VERSION_CONFLICT') return { ok: false, code: 'VERSION_CONFLICT', versiya: Number.isInteger(j.versiya) ? j.versiya as number : null };
  // RPC missing in the database (migration not applied yet) surfaces as SAVE_FAILED from the gateway.
  return { ok: false, code: typeof j.code === 'string' ? j.code : r.status === 401 ? 'AUTH_REQUIRED' : 'SAVE_FAILED' };
}
