import { tekshir } from '../_shared/auth';
import { supabaseBaseUrl } from '../_shared/supabase-url';

type Env = { SESSIYA_KALIT: string; SUPABASE_URL: string; SUPABASE_KEY: string; R2_CANONICAL: R2Bucket };
const ROOT = 'catalog-releases';
const HEX = /^[a-f0-9]{64}$/;
const MAX_SOURCE = 25 * 1024 * 1024;
const MAX_BODY = 4 * 1024 * 1024;
const MAX_CHUNKS = 150;
type Meta = { nom: string; tur: string; yil: number | null; kvartal: number | null; nds_holati: string; valyuta: string | null };
type Part = { index: number; sha256: string; rows: number };
const fail = (code: string, status = 400) => Response.json({ ok: false, code, error: code }, { status });
export async function digest(text: string | ArrayBuffer): Promise<string> {
  const bytes = typeof text === 'string' ? new TextEncoder().encode(text) : text;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
}
export function metadata(input: unknown): Meta | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const m = input as Record<string, unknown>;
  if (typeof m.nom !== 'string' || !m.nom.trim() || m.nom.length > 300 || !['katalog', 'chel_chas', 'kalkulyatsiya_mash'].includes(String(m.tur))) return null;
  if (m.yil != null && (!Number.isInteger(m.yil) || Number(m.yil) < 1990 || Number(m.yil) > 2100)) return null;
  if (m.kvartal != null && (typeof m.kvartal !== 'number' || ![1, 2, 3, 4].includes(m.kvartal))) return null;
  if (!['nomalum', 'nds_siz', 'nds_bilan'].includes(String(m.nds_holati))) return null;
  if (m.valyuta != null && (typeof m.valyuta !== 'string' || !/^[A-Z]{3}$/.test(m.valyuta))) return null;
  return { nom: m.nom.trim(), tur: String(m.tur), yil: m.yil == null ? null : Number(m.yil), kvartal: m.kvartal == null ? null : Number(m.kvartal), nds_holati: String(m.nds_holati), valyuta: m.valyuta == null ? null : String(m.valyuta) };
}
export function validRows(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 2000 && value.every(r => {
    if (!r || typeof r !== 'object' || Array.isArray(r)) return false;
    if (typeof r.nom !== 'string' || !r.nom.trim() || r.nom.length > 1500) return false;
    if (r.narx != null && (typeof r.narx !== 'number' || !Number.isFinite(r.narx) || r.narx < 0)) return false;
    return Object.values(r).every(v => v == null || typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v)) || typeof v === 'boolean');
  });
}
async function session(ctx: EventContext<Env, string, unknown>) {
  const s = await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT).catch(() => null);
  return s && Number.isSafeInteger(s.foydalanuvchi_id) && Number(s.foydalanuvchi_id) > 0 ? s : null;
}
async function writeActor(ctx: EventContext<Env, string, unknown>): Promise<number | Response> {
  const s = await session(ctx);
  if (!s) return fail('AUTH_REQUIRED', 401);
  if (!ctx.env.SUPABASE_URL || !ctx.env.SUPABASE_KEY || !ctx.env.R2_CANONICAL) return fail('CONFIG', 503);
  // Fresh database permission on EVERY upload/finalize. Cookie role and browser checkbox are not authority.
  const r = await fetch(supabaseBaseUrl(ctx.env.SUPABASE_URL) + '/rest/v1/rpc/t2_boshqaruv_umumiy_v1', {
    method: 'POST', headers: { apikey: ctx.env.SUPABASE_KEY, Authorization: 'Bearer ' + ctx.env.SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_actor_id: s.foydalanuvchi_id }),
  });
  if (!r.ok) {
    const denied = /SUPERADMIN_KERAK/.test(await r.text()) || r.status === 401 || r.status === 403;
    return fail(denied ? 'SUPERADMIN_REQUIRED' : 'AUTH_CHECK_FAILED', denied ? 403 : 502);
  }
  const body: unknown = await r.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body) || !('foydalanuvchi' in body) || ('ok' in body && body.ok === false)) return fail('SUPERADMIN_REQUIRED', 403);
  return s.foydalanuvchi_id as number;
}
async function immutablePut(bucket: R2Bucket, key: string, body: string | ArrayBuffer, sha: string, extra: Record<string, string> = {}) {
  const result = await bucket.put(key, body, { onlyIf: { etagDoesNotMatch: '*' }, customMetadata: { sha256: sha, ...extra }, httpMetadata: { contentType: 'application/octet-stream', cacheControl: 'private, max-age=31536000, immutable' } });
  if (!result) {
    const old = await bucket.head(key);
    if (old?.customMetadata?.sha256 !== sha) throw new Error('IMMUTABLE_CONFLICT');
  }
}
export const onRequestPost: PagesFunction<Env> = async ctx => {
  try {
    const origin = ctx.request.headers.get('Origin');
    if ((origin && origin !== new URL(ctx.request.url).origin) || ctx.request.headers.get('Sec-Fetch-Site') === 'cross-site') return fail('ORIGIN_FORBIDDEN', 403);
    const actor = await writeActor(ctx); if (actor instanceof Response) return actor;
    if (ctx.request.headers.get('Content-Type')?.startsWith('multipart/form-data')) {
      const declared = Number(ctx.request.headers.get('Content-Length'));
      if (!declared || declared > MAX_SOURCE + 65536) return fail('SOURCE_TOO_LARGE', 413);
      const form = await ctx.request.formData(); const file = form.get('fayl') as unknown as File | null;
      if (!(file instanceof File) || !file.size || file.size > MAX_SOURCE || !/\.(xlsx?|xlsm|pdf)$/i.test(file.name)) return fail('SOURCE_INVALID');
      const bytes = await file.arrayBuffer(); const sha = await digest(bytes);
      await immutablePut(ctx.env.R2_CANONICAL, `${ROOT}/sources/${sha}`, bytes, sha, { original_name: file.name.slice(0, 300), actor_id: String(actor) });
      return Response.json({ ok: true, source_sha256: sha, bytes: file.size });
    }
    const reader = ctx.request.body?.getReader(); if (!reader) return fail('JSON_INVALID');
    const pieces: Uint8Array[] = []; let size = 0;
    while (true) {
      const next = await reader.read(); if (next.done) break;
      size += next.value.length;
      if (size > MAX_BODY) { await reader.cancel(); return fail('CHUNK_TOO_LARGE', 413); }
      pieces.push(next.value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const piece of pieces) { bytes.set(piece, offset); offset += piece.length; }
    const text = new TextDecoder().decode(bytes);
    const input = JSON.parse(text) as Record<string, unknown>; const meta = metadata(input.metadata); const source = String(input.source_sha256 || '');
    if (!meta || !HEX.test(source)) return fail('METADATA_INVALID');
    const original = await ctx.env.R2_CANONICAL.head(`${ROOT}/sources/${source}`);
    if (!original || original.customMetadata?.sha256 !== source) return fail('SOURCE_NOT_STORED', 409);
    const revision = await digest(JSON.stringify({ source_sha256: source, metadata: meta }));
    if (input.action === 'chunk') {
      const index = input.index;
      if (!Number.isInteger(index) || Number(index) < 0 || Number(index) >= MAX_CHUNKS || !validRows(input.rows)) return fail('ROWS_INVALID');
      const body = JSON.stringify(input.rows); const sha = await digest(body);
      await immutablePut(ctx.env.R2_CANONICAL, `${ROOT}/releases/${revision}/chunks/${index}-${sha}.json`, body, sha, { rows: String(input.rows.length), revision });
      return Response.json({ ok: true, revision, part: { index, sha256: sha, rows: input.rows.length } });
    }
    if (input.action !== 'finalize' || !Array.isArray(input.parts) || !input.parts.length || input.parts.length > MAX_CHUNKS) return fail('PARTS_INVALID');
    const parts = input.parts as Part[]; let total = 0;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part.index !== i || !HEX.test(part.sha256) || !Number.isInteger(part.rows) || part.rows < 1 || part.rows > 2000) return fail('PARTS_INVALID');
      const obj = await ctx.env.R2_CANONICAL.head(`${ROOT}/releases/${revision}/chunks/${i}-${part.sha256}.json`);
      if (obj?.customMetadata?.sha256 !== part.sha256 || obj.customMetadata.rows !== String(part.rows) || obj.customMetadata.revision !== revision) return fail('CHUNK_MISSING', 409);
      total += part.rows;
    }
    if (input.total_rows !== total) return fail('ROW_COUNT_MISMATCH', 409);
    const key = `${ROOT}/manifests/${revision}.json`;
    const old = await ctx.env.R2_CANONICAL.get(key);
    if (old) {
      const existing = await old.json<{ parts: Part[] }>();
      if (JSON.stringify(existing.parts) !== JSON.stringify(parts)) return fail('IMMUTABLE_CONFLICT', 409);
      return Response.json({ ok: true, revision, rows: total, duplicate: true });
    }
    const manifest = { schema: 'catalog-release-v1', revision, scope: 'platform', metadata: meta, source_sha256: source, source_bytes: original.size, parts, total_rows: total, actor_id: actor, stored_at: new Date().toISOString(), status: 'reference', pricing_published: false };
    const body = JSON.stringify(manifest); await immutablePut(ctx.env.R2_CANONICAL, key, body, await digest(body));
    return Response.json({ ok: true, revision, rows: total });
  } catch (error) {
    return fail(error instanceof SyntaxError ? 'JSON_INVALID' : error instanceof Error && error.message === 'IMMUTABLE_CONFLICT' ? 'IMMUTABLE_CONFLICT' : 'CATALOG_STORE_FAILED', error instanceof SyntaxError ? 400 : 502);
  }
};
export const onRequestGet: PagesFunction<Env> = async ctx => {
  if (!await session(ctx)) return fail('AUTH_REQUIRED', 401);
  if (!ctx.env.R2_CANONICAL) return fail('CONFIG', 503);
  const url = new URL(ctx.request.url); const revision = url.searchParams.get('revision');
  const reference = url.searchParams.get('reference');
  if (reference != null) {
    if (reference !== 'c5822bb3610312bb') return fail('REFERENCE_INVALID');
    const data = await ctx.env.R2_CANONICAL.get(`reference-data/releases/${reference}/manifest.json`);
    if (!data) return fail('REFERENCE_NOT_FOUND', 404);
    return Response.json({ ok: true, reference: await data.json() }, { headers: { 'Cache-Control': 'private, max-age=3600' } });
  }
  if (!revision) {
    const cursor = url.searchParams.get('cursor') || undefined;
    const page = await ctx.env.R2_CANONICAL.list({ prefix: `${ROOT}/manifests/`, limit: 50, cursor });
    const releases = await Promise.all(page.objects.map(async o => (await ctx.env.R2_CANONICAL.get(o.key))?.json()));
    return Response.json({ ok: true, releases: releases.filter(Boolean), cursor: page.truncated ? page.cursor : null }, { headers: { 'Cache-Control': 'no-store' } });
  }
  if (!HEX.test(revision)) return fail('REVISION_INVALID');
  const obj = await ctx.env.R2_CANONICAL.get(`${ROOT}/manifests/${revision}.json`);
  if (!obj) return fail('CATALOG_NOT_FOUND', 404);
  const manifest = await obj.json<{ source_sha256: string; parts: Part[] }>(); const file = url.searchParams.get('file') || 'manifest';
  if (file === 'manifest') return Response.json({ ok: true, manifest });
  const index = Number(url.searchParams.get('index'));
  if (file !== 'source' && (file !== 'chunk' || !Number.isInteger(index) || index < 0 || index >= manifest.parts.length)) return fail('PATH_INVALID');
  const part = manifest.parts[index];
  const data = await ctx.env.R2_CANONICAL.get(file === 'source' ? `${ROOT}/sources/${manifest.source_sha256}` : `${ROOT}/releases/${revision}/chunks/${index}-${part.sha256}.json`);
  if (!data) return fail('FILE_NOT_FOUND', 404);
  return new Response(data.body, { headers: { 'Content-Type': file === 'source' ? 'application/octet-stream' : 'application/json', 'Content-Disposition': file === 'source' ? 'attachment' : 'inline', 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' } });
};
