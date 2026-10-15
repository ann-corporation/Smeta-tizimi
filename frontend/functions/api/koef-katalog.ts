/**
 * koef-katalog.ts — normative work-condition coefficients (ШНК 4.02 technical parts; owner 2026-10-15: "koeffitsientlar
 * qo'llanadigan vaziyatlar uchun bo'lishi va taklif qilishi kerak"). Immutable reference data in private R2.
 *
 *   GET /api/koef-katalog?f=current        → {revision} pointer (no-store)
 *   GET /api/koef-katalog?rev=<16 hex>     → immutable JSON {koef, jadval}
 *
 * Session required; body streamed from R2 without parsing. The client checks the revision it asked for.
 */
import { tekshir } from '../_shared/auth';

type Env = { SESSIYA_KALIT: string; R2_CANONICAL: R2Bucket };
const REVISION = /^[a-f0-9]{16}$/;

export function koefKatalogKey(rev: string | null, f: string | null): string | null {
  if (f === 'current' && rev == null) return 'koef-katalog/CURRENT.json';
  if (rev == null || !REVISION.test(rev)) return null;
  return `koef-katalog/${rev}.json`;
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const sess = await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT);
  if (!sess) return Response.json({ ok: false, code: 'AUTH_REQUIRED' }, { status: 401 });
  const url = new URL(ctx.request.url);
  const key = koefKatalogKey(url.searchParams.get('rev'), url.searchParams.get('f'));
  if (!key) return Response.json({ ok: false, code: 'KOEF_PATH_INVALID' }, { status: 400 });
  const obj = await ctx.env.R2_CANONICAL.get(key);
  if (!obj) return Response.json({ ok: false, code: 'KOEF_CATALOG_NOT_FOUND' }, { status: 404 });
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': key.endsWith('CURRENT.json') ? 'no-store' : 'private, max-age=31536000, immutable',
  });
  if (obj.httpMetadata?.contentEncoding === 'gzip') headers.set('Content-Encoding', 'gzip');
  return new Response(obj.body, { headers, encodeBody: 'manual' });
};
