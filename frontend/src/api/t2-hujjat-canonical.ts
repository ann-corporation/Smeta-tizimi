/**
 * t2-hujjat-canonical.ts — FILE-TRUTH-001 canonical document client.
 * EGALIK: Claude (backend/contract lane). Codex document-center UI shu
 * moduldan foydalanadi; UI komponentlari alohida lane.
 *
 * Canonical: Supabase (metadata) + Cloudflare R2 (binary). Drive/Sheets —
 * ikkilamchi sinxron replika. Bu modul Drive/GAS ga UMUMAN chaqiruv qilmaydi.
 */
import { yangiOperationId } from './supabase';

export type CanonicalDoc = {
  document_id: number;
  revision_seq: number;
  r2_key: string;
  sha256: string;
  size_bytes: number;
  versiya: number;
  /** Eskirgan (Drive olib tashlangan): server endi yubormaydi. */
  drive_sync?: 'pending' | 'syncing' | 'synced' | 'failed' | 'conflict' | 'not_configured';
};

export type UploadNatija =
  | { ok: true; data: CanonicalDoc }
  | { ok: false; code: string; xato?: string; r2_key?: string; sha256?: string };

/** SHA-256 (hex) of a File — computed in the browser (two-phase commit needs
 *  it before the bytes are streamed to the private canonical bucket). */
export async function faylSha256(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const d = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Canonical upload: Browser -> Cloudflare -> PRIVATE R2 -> Supabase.
 *  Two-phase (reserve -> put -> finalize); Drive kutilmaydi. */
export async function hujjatYukla(p: {
  file: File; kompaniyaId: number; loyihaId?: number | null; obyektId?: number | null;
  documentType?: string; revision?: string | null; operationId?: string;
}): Promise<UploadNatija> {
  let sha: string;
  try { sha = await faylSha256(p.file); }
  catch (e: any) { return { ok: false, code: 'HASH_FAILED', xato: 'sha256 hisoblanmadi: ' + (e?.message || String(e)) }; }

  const fd = new FormData();
  fd.append('fayl', p.file);
  fd.append('kompaniya_id', String(p.kompaniyaId));
  if (p.loyihaId != null) fd.append('loyiha_id', String(p.loyihaId));
  if (p.obyektId != null) fd.append('obyekt_id', String(p.obyektId));
  fd.append('turi', p.documentType || 'hujjat');
  if (p.revision != null) fd.append('revision', String(p.revision));
  fd.append('sha256', sha);
  fd.append('size', String(p.file.size));
  fd.append('operation_id', p.operationId || yangiOperationId());
  let j: any = null;
  try {
    const r = await fetch('/api/hujjat-yukla', { method: 'POST', body: fd });
    j = await r.json();
  } catch (e: any) {
    return { ok: false, code: 'NETWORK', xato: 'Tarmoq: ' + (e?.message || String(e)) };
  }
  if (j && j.ok) return { ok: true, data: j as CanonicalDoc };
  return { ok: false, code: (j && j.code) || 'UPLOAD_FAILED', xato: j && j.xato, r2_key: j && j.r2_key, sha256: j && j.sha256 };
}

// ── Canonical registry read model (DOCUMENT CENTER list) ────────────────────
// The RPC shape matches the Codex Document Center contract exactly.
import type { CenterDocument, DocumentHealth } from '../components/document-center';
export type { CenterDocument, DocumentHealth } from '../components/document-center';

export type DocRegistry = {
  ok: true; generated_at: string; rol: string;
  kompaniya_id: number; loyiha_id: number | null; obyekt_id: number | null;
  documents: CenterDocument[]; health: DocumentHealth[]; jami: number; drive_replica_failed: number;
};

export async function hujjatRoyxatOl(p: {
  kompaniyaId: number; loyihaId?: number | null; obyektId?: number | null; limit?: number;
}): Promise<DocRegistry> {
  const qs = new URLSearchParams({ kompaniya_id: String(Number(p.kompaniyaId)) });
  if (p.loyihaId) qs.set('loyiha_id', String(Number(p.loyihaId)));
  if (p.obyektId) qs.set('obyekt_id', String(Number(p.obyektId)));
  if (p.limit) qs.set('limit', String(Number(p.limit)));
  const r = await fetch('/api/hujjat-royxat?' + qs.toString());
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || j.ok !== true) {
    const err: any = new Error((j && (j.xato || j.code)) || ('HTTP ' + r.status));
    err.code = (j && j.code) || ('HTTP_' + r.status);
    throw err;
  }
  return j as DocRegistry;
}

/** Canonical download URL — reads R2 via Cloudflare with authorization. Drive EMAS. */
export function hujjatYuklabOlishUrl(documentId: number): string {
  return '/api/hujjat-ol?id=' + Number(documentId);
}

/** Programmatic canonical fetch (e.g. for preview). Never touches Drive. */
export async function hujjatOl(documentId: number): Promise<Blob | { ok: false; code: string }> {
  const r = await fetch(hujjatYuklabOlishUrl(documentId));
  if (!r.ok) {
    let j: any = null;
    try { j = await r.json(); } catch { /* binary error page */ }
    return { ok: false, code: (j && j.code) || ('HTTP_' + r.status) };
  }
  return await r.blob();
}
