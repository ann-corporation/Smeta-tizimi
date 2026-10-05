/**
 * hujjat-yukla.ts — FILE-TRUTH-001 CANONICAL DOCUMENT UPLOAD (two-phase)
 * ═══════════════════════════════════════════════════════════════════
 * PRIVATE canonical bucket R2_CANONICAL (no public domain). Two-phase
 * commit so a failed registry write never leaves an orphan R2 object:
 *
 *   1. RPC t2_document_canonical_reserve_v1  -> document_id + deterministic r2_key
 *   2. stream bytes -> R2_CANONICAL.put(r2_key)
 *   3. RPC t2_document_canonical_finalize_v1 -> 'stored', enqueue Drive mirror job
 *
 * On interruption between 2 and 3 the row stays 'reserved' and the reconcile
 * worker (`apiT2ReplicaSyncTick` / a scheduled function) HEADs R2 and calls
 * t2_document_canonical_reconcile_v1. Drive/GAS are never on this path.
 *
 * multipart/form-data:
 *   fayl          File (required)
 *   kompaniya_id  number (required)
 *   loyiha_id     number (optional)
 *   obyekt_id     number (optional)
 *   turi          document_type (default 'hujjat')
 *   operation_id  uuid (required — idempotency)
 *   sha256        hex (required — client-computed)
 *   size          bytes (required)
 *   revision      string (optional)
 *   source_slot_key optional, immutable logical source slot for a multi-file
 *                   smeta package. Different slots are independent documents,
 *                   not revisions of one another.
 */
import { tekshir } from '../_shared/auth';
import { supabaseBaseUrl } from '../_shared/supabase-url';

type Env = {
  SUPABASE_URL: string; SUPABASE_KEY: string; SESSIYA_KALIT: string;
  R2_CANONICAL: R2Bucket;
  CANONICAL_HASH_INLINE_LIMIT?: string; // bytes; default 25 MiB. Files at or below this are re-hashed server-side.
  CANONICAL_MAX_UPLOAD_BYTES?: string;  // bytes; default 512 MiB hard limit.
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX64 = /^[0-9a-f]{64}$/i;
const SOURCE_SLOT_KEY = /^[a-z0-9][a-z0-9._:-]{0,180}$/;
const DEFAULT_INLINE_LIMIT = 25 * 1024 * 1024;
const DEFAULT_MAX_BYTES = 512 * 1024 * 1024;

async function rpc(env: Env, name: string, args: Record<string, unknown>) {
  const r = await fetch(supabaseBaseUrl(env.SUPABASE_URL) + '/rest/v1/rpc/' + name, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_KEY, Authorization: 'Bearer ' + env.SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const text = await r.text();
  let j: any = null;
  try { j = JSON.parse(text); } catch { /* keep raw */ }
  return { httpOk: r.ok, body: j, raw: text };
}

function safeName(name: string): string {
  const parts = String(name || 'fayl').split('/').join('_').split('\\').join('_');
  return parts.replace(/\.\.+/g, '_').replace(/\s+/g, '_').slice(0, 180) || 'fayl';
}
async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function upstreamDocumentFailure(code: string, status = 502) {
  return Response.json({
    ok: false,
    code,
    xato: 'Kanonik hujjat reyestri vaqtincha ishlamadi. Birozdan so‘ng qayta urinib ko‘ring.',
  }, { status });
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  try {
    const sess = await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT);
    if (!sess) return Response.json({ ok: false, code: 'AUTH_REQUIRED', xato: 'Kirish talab qilinadi' }, { status: 401 });
    const actorId = (sess as any).foydalanuvchi_id;
    if (actorId == null) return Response.json({ ok: false, code: 'AUTH_REQUIRED', xato: 'Sessiyada foydalanuvchi yo‘q — qayta kiring' }, { status: 401 });
    if (!ctx.env.SUPABASE_URL || !ctx.env.SUPABASE_KEY) return Response.json({ ok: false, code: 'CONFIG', xato: 'Supabase sozlanmagan' }, { status: 500 });
    if (!ctx.env.R2_CANONICAL) return Response.json({ ok: false, code: 'CONFIG', xato: 'R2_CANONICAL (private) binding yo‘q' }, { status: 500 });

    const inlineLimit = Number(ctx.env.CANONICAL_HASH_INLINE_LIMIT || DEFAULT_INLINE_LIMIT) || DEFAULT_INLINE_LIMIT;
    const maxBytes = Number(ctx.env.CANONICAL_MAX_UPLOAD_BYTES || DEFAULT_MAX_BYTES) || DEFAULT_MAX_BYTES;

    const form = await ctx.request.formData();
    const file = form.get('fayl') as unknown as File | null;
    const kompaniyaId = Number(form.get('kompaniya_id'));
    const loyihaId = form.get('loyiha_id') != null && form.get('loyiha_id') !== '' ? Number(form.get('loyiha_id')) : null;
    const obyektId = form.get('obyekt_id') != null && form.get('obyekt_id') !== '' ? Number(form.get('obyekt_id')) : null;
    const turi = String(form.get('turi') || 'hujjat').trim() || 'hujjat';
    const operationId = String(form.get('operation_id') || '').trim();
    const clientSha = String(form.get('sha256') || '').trim().toLowerCase();
    const declaredSize = Number(form.get('size') || (file ? (file as any).size : 0)) || 0;
    const revision = form.get('revision') != null ? String(form.get('revision')) : null;
    const sourceSlotKey = form.get('source_slot_key') != null ? String(form.get('source_slot_key')).trim().toLowerCase() : '';

    if (!file || typeof file.stream !== 'function') return Response.json({ ok: false, code: 'DOCUMENT_CONTEXT_REQUIRED', xato: 'Fayl topilmadi' }, { status: 400 });
    if (!kompaniyaId || !UUID.test(operationId)) return Response.json({ ok: false, code: 'DOCUMENT_CONTEXT_REQUIRED', xato: 'kompaniya_id va UUID operation_id majburiy' }, { status: 400 });
    if (!HEX64.test(clientSha)) return Response.json({ ok: false, code: 'DOCUMENT_CONTRACT_INVALID', xato: 'Brauzer tomonidan hisoblangan sha256 (64 hex) majburiy' }, { status: 400 });
    if (declaredSize <= 0) return Response.json({ ok: false, code: 'DOCUMENT_CONTRACT_INVALID', xato: 'Fayl hajmi majburiy' }, { status: 400 });
    if (declaredSize > maxBytes) return Response.json({ ok: false, code: 'FILE_TOO_LARGE', xato: 'Fayl chegaradan katta (' + maxBytes + ' bayt)', max_bytes: maxBytes }, { status: 413 });
    if (sourceSlotKey && !SOURCE_SLOT_KEY.test(sourceSlotKey)) return Response.json({ ok: false, code: 'SOURCE_SLOT_INVALID', xato: 'Manba bo‘lagi kaliti noto‘g‘ri' }, { status: 400 });
    if (sourceSlotKey && !['smeta_lrv', 'smeta_res'].includes(turi)) return Response.json({ ok: false, code: 'SOURCE_DOCUMENT_TYPE_INVALID', xato: 'Paket manbasi faqat LRV yoki RES bo‘lishi mumkin' }, { status: 400 });

    // ── PHASE 1: reserve ──────────────────────────────────────────────────
    const reserve = await rpc(ctx.env, sourceSlotKey ? 't2_document_canonical_reserve_slot_v1' : 't2_document_canonical_reserve_v1',
      sourceSlotKey
        ? {
            p_kompaniya_id: kompaniyaId, p_actor_id: actorId, p_loyiha_id: loyihaId, p_obyekt_id: obyektId,
            p_document_type: turi, p_source_slot_key: sourceSlotKey,
            p_original_filename: safeName(file.name), p_mime_type: file.type || 'application/octet-stream',
            p_expected_size: declaredSize, p_client_sha256: clientSha, p_operation_id: operationId, p_revision: revision,
          }
        : {
            p_kompaniya_id: kompaniyaId, p_actor_id: actorId, p_loyiha_id: loyihaId, p_obyekt_id: obyektId,
            p_document_type: turi, p_original_filename: safeName(file.name), p_mime_type: file.type || 'application/octet-stream',
            p_expected_size: declaredSize, p_client_sha256: clientSha, p_operation_id: operationId, p_revision: revision,
          });
    if (!reserve.httpOk || !reserve.body || reserve.body.ok !== true) {
      return upstreamDocumentFailure((reserve.body && typeof reserve.body.code === 'string') ? reserve.body.code : 'DOCUMENT_RESERVE_FAILED');
    }
    const documentId: number = reserve.body.document_id;
    const r2Key: string = reserve.body.r2_key;
    // Already stored (retry) — nothing more to do.
    if (reserve.body.canonical_storage_status === 'stored') {
      return Response.json({ ok: true, document_id: documentId, r2_key: r2Key, sha256: reserve.body.sha256,
        versiya: reserve.body.versiya, drive_sync: 'pending', retry: true, dedup: reserve.body.dedup === true });
    }

    // ── PHASE 2: bytes -> PRIVATE R2 ─────────────────────────────────────
    const mime = file.type || 'application/octet-stream';
    const meta = {
      httpMetadata: { contentType: mime },
      customMetadata: { sha256: clientSha, document_id: String(documentId), operation_id: operationId, kompaniya_id: String(kompaniyaId) },
    };
    let serverSha: string | null = null;
    let verified = false;
    let hashSource: 'server' | 'client' = 'client';

    if (declaredSize <= inlineLimit) {
      // small file: buffer once (bounded), verify hash, then store
      const buf = await file.arrayBuffer();
      if (buf.byteLength !== declaredSize) {
        await rpc(ctx.env, 't2_document_canonical_reconcile_v1', { p_document_id: documentId, p_r2_key_exists: false });
        return Response.json({ ok: false, code: 'SIZE_MISMATCH', xato: 'Yuborilgan hajm faylga mos emas' }, { status: 400 });
      }
      serverSha = await sha256Hex(buf);
      if (serverSha !== clientSha) {
        await rpc(ctx.env, 't2_document_canonical_reconcile_v1', { p_document_id: documentId, p_r2_key_exists: false });
        return Response.json({ ok: false, code: 'CANONICAL_HASH_MISMATCH', xato: 'Fayl butunligi tekshiruvi o‘tmadi' }, { status: 400 });
      }
      await ctx.env.R2_CANONICAL.put(r2Key, buf, meta);
      verified = true; hashSource = 'server';
    } else {
      // large file: true streaming to R2, no whole-file RAM buffering.
      // The hash is the client's (documented limit); reconcile can re-verify later.
      await ctx.env.R2_CANONICAL.put(r2Key, file.stream(), meta);
      verified = false; hashSource = 'client';
    }

    // ── PHASE 3: finalize ────────────────────────────────────────────────
    const fin = await rpc(ctx.env, 't2_document_canonical_finalize_v1', {
      p_kompaniya_id: kompaniyaId, p_actor_id: actorId, p_document_id: documentId, p_operation_id: operationId,
      p_r2_key: r2Key, p_sha256: serverSha || clientSha, p_size_bytes: declaredSize,
      p_sha256_verified: verified, p_hash_source: hashSource,
    });
    if (!fin.httpOk || !fin.body || fin.body.ok !== true) {
      // R2 object exists but registry not finalized -> reconcile worker will
      // finalize it from R2 (row stays 'reserved'). Report a soft failure.
      return Response.json({
        ok: false,
        code: (fin.body && typeof fin.body.code === 'string') ? fin.body.code : 'DOCUMENT_FINALIZE_FAILED',
        xato: 'Fayl saqlandi, reyestr yakunlanmadi — tiklash jarayoni davom etadi.',
        document_id: documentId, r2_key: r2Key, canonical_storage_status: 'reserved',
      }, { status: 202 });
    }

    return Response.json({
      ok: true, document_id: documentId, revision_seq: fin.body.revision_seq,
      r2_key: r2Key, sha256: fin.body.sha256, sha256_verified: fin.body.sha256_verified,
      size_bytes: declaredSize, versiya: fin.body.versiya, drive_sync: 'pending',
    });
  } catch {
    return Response.json({
      ok: false,
      code: 'UPLOAD_FAILED',
      xato: 'Kanonik fayl yuklanmadi. Birozdan so‘ng qayta urinib ko‘ring.',
    }, { status: 500 });
  }
};
