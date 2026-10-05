/**
 * narx-katalog.ts — platform price catalogue read port (immutable R2 shards; owner rule 2026-10-05:
 * unchanging reference data lives in R2, changing business data in Supabase).
 *
 *   GET /api/narx-katalog?f=current                      → {revision} pointer (no-store)
 *   GET /api/narx-katalog?rev=<16 hex>&f=<allowed path>  → immutable gzip JSON
 *
 * Session required. Whitelisted paths only; body streamed from private R2 without parsing.
 * The client verifies every file against the manifest sha256.
 */
import { tekshir } from '../_shared/auth';

type Env = { SESSIYA_KALIT: string; R2_CANONICAL: R2Bucket };
const REVISION = /^[a-f0-9]{16}$/;
const FILE = /^(manifest\.json|dict\.json|[ri]\/\d{4}\.json)$/;

export function narxKatalogKey(rev: string | null, f: string | null): string | null {
  if (f === 'current' && rev == null) return 'narx-katalog/CURRENT.json';
  if (rev == null || f == null || !REVISION.test(rev) || !FILE.test(f)) return null;
  return `narx-katalog/${rev}/${f}`;
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const sess = await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT);
  if (!sess) return Response.json({ ok: false, code: 'AUTH_REQUIRED' }, { status: 401 });
  const url = new URL(ctx.request.url);
  const key = narxKatalogKey(url.searchParams.get('rev'), url.searchParams.get('f'));
  if (!key) return Response.json({ ok: false, code: 'PRICE_PATH_INVALID' }, { status: 400 });
  const obj = await ctx.env.R2_CANONICAL.get(key);
  if (!obj) return Response.json({ ok: false, code: 'PRICE_CATALOG_NOT_FOUND' }, { status: 404 });
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': key.endsWith('CURRENT.json') ? 'no-store' : 'private, max-age=31536000, immutable',
  });
  if (obj.httpMetadata?.contentEncoding === 'gzip') headers.set('Content-Encoding', 'gzip');
  return new Response(obj.body, { headers, encodeBody: 'manual' });
};
