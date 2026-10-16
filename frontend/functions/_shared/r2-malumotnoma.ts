/**
 * Small immutable reference files in private R2 (owner rule 2026-10-05: unchanging reference data in R2):
 *   GET ?f=current     → <prefix>/CURRENT.json (no-store)
 *   GET ?rev=<16 hex>  → <prefix>/<rev>.json   (immutable)
 * Session required; body streamed from R2 without parsing.
 */
import { tekshir } from './auth';

type Env = { SESSIYA_KALIT: string; R2_CANONICAL: R2Bucket };
const REVISION = /^[a-f0-9]{16}$/;

export function malumotnomaKey(prefix: string, rev: string | null, f: string | null): string | null {
  if (f === 'current' && rev == null) return `${prefix}/CURRENT.json`;
  if (rev == null || !REVISION.test(rev)) return null;
  return `${prefix}/${rev}.json`;
}

export function malumotnomaGet(prefix: string, code: string): PagesFunction<Env> {
  return async (ctx) => {
    const sess = await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT);
    if (!sess) return Response.json({ ok: false, code: 'AUTH_REQUIRED' }, { status: 401 });
    const url = new URL(ctx.request.url);
    const key = malumotnomaKey(prefix, url.searchParams.get('rev'), url.searchParams.get('f'));
    if (!key) return Response.json({ ok: false, code: `${code}_PATH_INVALID` }, { status: 400 });
    const obj = await ctx.env.R2_CANONICAL.get(key);
    if (!obj) return Response.json({ ok: false, code: `${code}_NOT_FOUND` }, { status: 404 });
    const headers = new Headers({
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': key.endsWith('CURRENT.json') ? 'no-store' : 'private, max-age=31536000, immutable',
    });
    if (obj.httpMetadata?.contentEncoding === 'gzip') headers.set('Content-Encoding', 'gzip');
    return new Response(obj.body, { headers, encodeBody: 'manual' });
  };
}
