/**
 * Local draft recovery (IndexedDB). A convenience against tab close/refresh — NOT the
 * canonical store: canonical save goes through the named server command with actor,
 * tenant, operation_id and version. Storage failures never block editing.
 */
import { get, set } from 'idb-keyval';
import { STUDIO_SCHEMA, type EstimateDoc } from './model';

const KEY = 'smeta-studio:last-draft';
export type StoredDraft = { doc: EstimateDoc; serverVersion: number };
const valid = (v: unknown): v is EstimateDoc => !!v && (v as EstimateDoc).schema === STUDIO_SCHEMA && typeof (v as EstimateDoc).draftId === 'string';

export async function loadLastDraft(): Promise<StoredDraft | null> {
  try {
    const v = await get(KEY) as StoredDraft | EstimateDoc | undefined;
    if (valid(v)) return { doc: v, serverVersion: 0 };   // older local format
    if (v && valid((v as StoredDraft).doc)) return { doc: (v as StoredDraft).doc, serverVersion: Number((v as StoredDraft).serverVersion) || 0 };
    return null;
  } catch { return null; }
}

export async function saveDraft(doc: EstimateDoc, serverVersion: number): Promise<boolean> {
  try { await set(KEY, { doc, serverVersion } satisfies StoredDraft); return true; } catch { return false; }
}
