/** Authenticated, pinned REVIEW_ONLY reference release; contains no tenant rows. */
import { tekshir } from '../_shared/auth';
import type { R2Bucket, PagesFunction } from '@cloudflare/workers-types';

type Env = { SESSIYA_KALIT: string; R2_CANONICAL: R2Bucket };

const REVISION = '66bb1a23bd18c63006d447b5';
// Verified against the local release manifest. audit.json is deliberately not exposed.
const FILES: ReadonlySet<string> = new Set([
  'manifest.json', 'navigation.json', 'works.jsonl.gz', 'coefficient-rules.json',
  ...Array.from({ length: 112 }, (_, i) => `collection-${String(i).padStart(3, '0')}.json.gz`),
]);

export function normLibraryKey(rev: string | null, f: string | null): string | null {
  if ((rev !== null && rev !== REVISION) || f === null || !FILES.has(f)) return null;
  return `norm-library/review-releases/${REVISION}/${f}`;
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const sess = await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT);
  if (!sess) return Response.json({ ok: false, code: 'AUTH_REQUIRED' }, { status: 401 });
  const url = new URL(ctx.request.url);
  // Reject ambiguous repeated selectors rather than silently choosing the first.
  const key = url.searchParams.getAll('rev').length > 1 || url.searchParams.getAll('f').length > 1
    ? null : normLibraryKey(url.searchParams.get('rev'), url.searchParams.get('f'));
  if (!key) return Response.json({ ok: false, code: 'NORM_PATH_INVALID' }, { status: 400 });
  const obj = await ctx.env.R2_CANONICAL.get(key);
  if (!obj) return Response.json({ ok: false, code: 'NORM_LIBRARY_NOT_FOUND' }, { status: 404 });
  // Never copy R2 Content-Encoding: the browser hashes compressed bytes before
  // DecompressionStream. Keep the body streamed and leave gzip as opaque bytes.
  return new Response(obj.body, { headers: {
    'Content-Type': key.endsWith('.gz') ? 'application/octet-stream' : 'application/json; charset=utf-8',
    'Cache-Control': 'private, max-age=31536000, immutable, no-transform',
    'X-Content-Type-Options': 'nosniff',
    'X-Norm-Library-Status': 'REVIEW_ONLY',
  } });
};
