/**
 * hujjat-r2.ts — FILE-TRUTH-001 INTERNAL canonical-binary read for the
 * replica sync worker (GAS). NOT a user endpoint.
 *
 * Auth: a shared secret header `X-Replica-Sync-Secret` == env.REPLICA_SYNC_SECRET.
 * The secret alone is not sufficient: the requested key must belong to a
 * `stored` t2_document_registry row for the given kompaniya_id.
 *
 *   GET /api/hujjat-r2?document_id=<n>&kompaniya_id=<n>   (X-Replica-Sync-Secret)
 *
 * Used only by the canonical -> Drive mirror job. Never exposed to browsers.
 */
import { supabaseBaseUrl } from '../_shared/supabase-url';

type Env = {
  SUPABASE_URL: string; SUPABASE_KEY: string; REPLICA_SYNC_SECRET: string;
  R2_CANONICAL: R2Bucket;
};

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  try {
    const secret = ctx.request.headers.get('X-Replica-Sync-Secret') || '';
    if (!ctx.env.REPLICA_SYNC_SECRET || secret !== ctx.env.REPLICA_SYNC_SECRET) {
      return Response.json({ ok: false, code: 'FORBIDDEN' }, { status: 403 });
    }
    const u = new URL(ctx.request.url);
    const documentId = Number(u.searchParams.get('document_id'));
    const kompaniyaId = Number(u.searchParams.get('kompaniya_id'));
    if (!documentId || !kompaniyaId) return Response.json({ ok: false, code: 'BAD_REQUEST' }, { status: 400 });

    const r = await fetch(supabaseBaseUrl(ctx.env.SUPABASE_URL) +
      '/rest/v1/t2_document_registry?id=eq.' + documentId + '&kompaniya_id=eq.' + kompaniyaId +
      '&canonical_storage_status=eq.stored&select=r2_key,blob_key,mime_type,original_filename,sha256,size_bytes&limit=1', {
      headers: { apikey: ctx.env.SUPABASE_KEY, Authorization: 'Bearer ' + ctx.env.SUPABASE_KEY },
    });
    const rows = await r.json().catch(() => []);
    if (!Array.isArray(rows) || rows.length !== 1 || !rows[0].r2_key) {
      return Response.json({ ok: false, code: 'DOCUMENT_NOT_FOUND' }, { status: 404 });
    }
    const row = rows[0];
    // blob_key — jismoniy obyekt (mazmun boshqa hujjat bilan baham ko'rilgan bo'lsa); aks holda r2_key ning o'zi.
    const obj = await ctx.env.R2_CANONICAL.get(row.blob_key || row.r2_key);
    if (!obj) return Response.json({ ok: false, code: 'CANONICAL_BINARY_MISSING', r2_key: row.r2_key }, { status: 502 });

    const headers = new Headers();
    headers.set('Content-Type', row.mime_type || 'application/octet-stream');
    if (row.size_bytes) headers.set('Content-Length', String(row.size_bytes));
    if (row.sha256) headers.set('X-Canonical-Sha256', row.sha256);
    headers.set('X-Canonical-Filename', encodeURIComponent(row.original_filename || ('document-' + documentId)));
    return new Response(obj.body, { headers });
  } catch (err: any) {
    return Response.json({ ok: false, code: 'READ_FAILED', xato: String(err?.message || err) }, { status: 500 });
  }
};
