/**
 * norm-katalog.ts — platform normative catalogue read port (REVIEW_ONLY source shards).
 *
 *   GET /api/norm-katalog?f=current                      → {revision} pointer (no-store)
 *   GET /api/norm-katalog?rev=<16 hex>&f=<allowed path>  → immutable gzip JSON shard
 *
 * Session required (platform reference data, no tenant rows). Paths are whitelisted;
 * the body is streamed from private R2 without parsing (Workers CPU budget). Integrity:
 * the client verifies each file's sha256 against the revision manifest.
 */
import { tekshir } from '../_shared/auth';

type Env = { SESSIYA_KALIT: string; R2_CANONICAL: R2Bucket };

const REVISION = /^[a-f0-9]{16}$/;
const FILE = /^(manifest\.json|tree\.json|works\.json|s\/\d{4}\.json)$/;

export function normKatalogKey(rev: string | null, f: string | null): string | null {
  if (f === 'current' && rev == null) return 'norm-katalog/CURRENT.json';
  if (rev == null || f == null || !REVISION.test(rev) || !FILE.test(f)) return null;
  return `norm-katalog/${rev}/${f}`;
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const sess = await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT);
  if (!sess) return Response.json({ ok: false, code: 'AUTH_REQUIRED' }, { status: 401 });
  const url = new URL(ctx.request.url);
  const key = normKatalogKey(url.searchParams.get('rev'), url.searchParams.get('f'));
  if (!key) return Response.json({ ok: false, code: 'NORM_PATH_INVALID' }, { status: 400 });
  const obj = await ctx.env.R2_CANONICAL.get(key);
  if (!obj) return Response.json({ ok: false, code: 'NORM_CATALOG_NOT_FOUND' }, { status: 404 });
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': key.endsWith('CURRENT.json') ? 'no-store' : 'private, max-age=31536000, immutable',
    'X-Norm-Catalog-Status': 'REVIEW_ONLY',
  });
  if (obj.httpMetadata?.contentEncoding === 'gzip') headers.set('Content-Encoding', 'gzip');
  return new Response(obj.body, { headers, encodeBody: 'manual' });
};
