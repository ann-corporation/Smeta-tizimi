/**
 * narx-katalog-nashr.ts — the system administrator publishes a new platform price index (owner 2026-10-15: "katalogni tizim
 * boshqaruvchisi yuklab yangilab borishi kerak, u butun tizim bo'yicha ishlaydi"). The browser parses the editions and
 * builds the shards (lib/narx-katalog/nashr-birlashtir); this port only stores verified files and flips the pointer.
 *
 *   POST { amal: 'fayllar', revision, files: [{ path, sha256, text }] }   → immutable writes narx-katalog/<rev>/<path> (gzip)
 *   POST { amal: 'faollashtir', revision, manifest }                       → every listed file present with its sha256 →
 *                                                                           manifest written, CURRENT → revision (previous kept)
 * Superadmin re-verified in the database on every call. Company users never write here (their prices stay company-scoped).
 */
import { superadminActor, type SuperadminEnv } from '../_shared/superadmin';
import { r2Yoz } from '../_shared/r2-saqlash';
import { catalogSearchPath } from '../../src/lib/narx-katalog/catalog-search';

type Env = SuperadminEnv & { R2_CANONICAL: R2Bucket };
const REVISION = /^[a-f0-9]{16}$/;
const PATH = /^(dict\.json|[ri]\/\d{4}\.json)$/;
const storedPath = (path: string) => PATH.test(path) || catalogSearchPath.test(path);
const MAX_BODY = 40 * 1024 * 1024;
const fail = (code: string, status = 400) => Response.json({ ok: false, code }, { status, headers: { 'Cache-Control': 'no-store' } });
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');

async function gzip(bytes: Uint8Array): Promise<ArrayBuffer> {
  return new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
}
type FileMeta = { path: string; sha256: string; bytes: number };
export function manifestFiles(m: unknown): FileMeta[] | null {
  const f = (m as { files?: { dict?: FileMeta; rows?: FileMeta[]; lookup?: FileMeta[]; search?: FileMeta[] } } | null)?.files;
  if (!f?.dict || !Array.isArray(f.rows) || !f.rows.length) return null;
  if ((f.lookup != null && !Array.isArray(f.lookup)) ||
      (f.search != null && (!Array.isArray(f.search) || f.search.length > 64 || !f.search.every(x => x && catalogSearchPath.test(x.path))))) return null;
  const all = [f.dict, ...f.rows, ...(f.lookup ?? []), ...(f.search ?? [])];
  return all.every(x => x && storedPath(x.path) && /^[a-f0-9]{64}$/.test(x.sha256) && Number.isSafeInteger(x.bytes)) &&
    new Set(all.map(x => x.path)).size === all.length ? all : null;
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const actor = await superadminActor(ctx.request, ctx.env);
  if ('code' in actor) return fail(actor.code, actor.status);
  if (!ctx.env.R2_CANONICAL) return fail('CONFIG', 503);
  const raw = await ctx.request.text();
  if (raw.length > MAX_BODY) return fail('BODY_TOO_LARGE', 413);
  let so: Record<string, unknown>;
  try { so = JSON.parse(raw); } catch { return fail('BODY_INVALID'); }
  const revision = String(so.revision ?? '');
  if (!REVISION.test(revision)) return fail('REVISION_INVALID');
  const prefix = `narx-katalog/${revision}/`;

  if (so.amal === 'fayllar') {
    const files = Array.isArray(so.files) ? so.files as Array<{ path?: unknown; sha256?: unknown; text?: unknown }> : [];
    if (!files.length || files.length > 300) return fail('FILES_INVALID');
    let yozildi = 0;
    for (const f of files) {
      if (typeof f.path !== 'string' || !storedPath(f.path) || typeof f.sha256 !== 'string' || typeof f.text !== 'string') return fail('FILES_INVALID');
      const bytes = new TextEncoder().encode(f.text);
      const sha = hex(await crypto.subtle.digest('SHA-256', bytes));
      if (sha !== f.sha256) return fail('SHA_MISMATCH');
      try { JSON.parse(f.text); } catch { return fail('FILE_NOT_JSON'); }
      const key = prefix + f.path;
      const old = await ctx.env.R2_CANONICAL.head(key);
      if (old) { if (old.customMetadata?.sha256 !== sha) return fail('IMMUTABLE_CONFLICT', 409); continue; }
      await r2Yoz(ctx.env.R2_CANONICAL, key, await gzip(bytes), { customMetadata: { sha256: sha, bytes: String(bytes.length), actor: String(actor.id) },
        httpMetadata: { contentType: 'application/json', contentEncoding: 'gzip', cacheControl: 'private, max-age=31536000, immutable' } });
      yozildi++;
    }
    return Response.json({ ok: true, yozildi }, { headers: { 'Cache-Control': 'no-store' } });
  }

  if (so.amal === 'faollashtir') {
    const manifest = so.manifest as Record<string, unknown> | null;
    if (!manifest || manifest.revision !== revision || manifest.schema !== 'narx-katalog-shards-v1') return fail('MANIFEST_INVALID');
    const files = manifestFiles(manifest);
    if (!files) return fail('MANIFEST_INVALID');
    for (const f of files) {
      const h = await ctx.env.R2_CANONICAL.head(prefix + f.path);
      if (!h || h.customMetadata?.sha256 !== f.sha256) return fail('FILE_MISSING:' + f.path, 409);
    }
    const cur = await ctx.env.R2_CANONICAL.get('narx-katalog/CURRENT.json');
    let previous: string | null = null;
    if (cur) {
      const txt = cur.httpMetadata?.contentEncoding === 'gzip'
        ? await new Response(cur.body.pipeThrough(new DecompressionStream('gzip'))).text() : await cur.text();
      previous = (JSON.parse(txt) as { revision?: string }).revision ?? null;
    }
    const full = { ...manifest, previous, activatedBy: actor.id, activatedAt: new Date().toISOString() };
    await r2Yoz(ctx.env.R2_CANONICAL, prefix + 'manifest.json', await gzip(new TextEncoder().encode(JSON.stringify(full))),
      { httpMetadata: { contentType: 'application/json', contentEncoding: 'gzip', cacheControl: 'private, max-age=31536000, immutable' } });
    await r2Yoz(ctx.env.R2_CANONICAL, 'narx-katalog/CURRENT.json', await gzip(new TextEncoder().encode(JSON.stringify({ revision, schema: manifest.schema, previous }))),
      { httpMetadata: { contentType: 'application/json', contentEncoding: 'gzip', cacheControl: 'no-store' } });
    return Response.json({ ok: true, revision, previous }, { headers: { 'Cache-Control': 'no-store' } });
  }
  return fail('AMAL_INVALID');
};
