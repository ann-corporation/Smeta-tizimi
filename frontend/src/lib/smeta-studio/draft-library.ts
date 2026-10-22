import { get, update } from 'idb-keyval';
import { STUDIO_SCHEMA, type EstimateDoc } from './model';

export type DraftAction = () => Promise<void>;
export type DraftSummary = { draftId: string; companyId: number | null; title: string; objectLabel: string; works: number; savedAt: string };
export type LibraryDraft = { doc: EstimateDoc; serverVersion: number; revision: number; savedAt: string; companyId: number | null; indexed?: boolean };
const INDEX = 'smeta-studio:library:v1';
const key = (companyId: number | null, id: string) => `${INDEX}:${companyId ?? 'unbound'}:${encodeURIComponent(id)}`;
const valid = (v: unknown): v is LibraryDraft => {
  const d = v as LibraryDraft | null;
  return !!d && d.doc?.schema === STUDIO_SCHEMA && typeof d.doc.draftId === 'string' && Number.isInteger(d.revision) && d.revision > 0;
};
export async function readLibraryDraft(companyId: number | null, draftId: string): Promise<LibraryDraft | null> {
  const v: unknown = await get(key(companyId, draftId));
  if (!valid(v) || v.companyId !== companyId || v.doc.draftId !== draftId) return null;
  if (v.doc.context.companyId != null && v.doc.context.companyId !== companyId) return null;
  return v;
}
export async function listLibraryDrafts(companyId: number | null): Promise<DraftSummary[]> {
  const index = await get(INDEX) as Record<string, DraftSummary> | undefined;
  return Object.values(index ?? {}).filter(x => x.companyId === companyId).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}
/** Local recovery only. Atomic revision comparison rejects another tab's stale write. */
export async function writeLibraryDraft(companyId: number | null, doc: EstimateDoc, serverVersion: number, expectedRevision: number): Promise<LibraryDraft> {
  if (doc.context.companyId != null && doc.context.companyId !== companyId) throw new Error('DRAFT_COMPANY_MISMATCH');
  const record: LibraryDraft = { doc, companyId, serverVersion, revision: expectedRevision + 1, savedAt: new Date().toISOString() };
  const recordKey = key(companyId, doc.draftId);
  await update(recordKey, (previous: unknown) => {
    if ((valid(previous) ? previous.revision : 0) !== expectedRevision) throw new Error('LOCAL_VERSION_CONFLICT');
    return record;
  });
  const summary: DraftSummary = { draftId: doc.draftId, companyId, title: doc.context.title, objectLabel: doc.context.objectLabel,
    works: Object.keys(doc.occurrences).length, savedAt: record.savedAt };
  // A failed index update does not delete the recoverable document; caller sees the failure.
  try { await update(INDEX, (index: Record<string, DraftSummary> | undefined) => ({ ...index, [recordKey]: summary })); }
  catch { return { ...record, indexed: false }; }
  return record;
}
