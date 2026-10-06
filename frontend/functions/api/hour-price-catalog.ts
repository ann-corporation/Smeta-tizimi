import { tekshir } from '../_shared/auth';
type Env = { SESSIYA_KALIT: string; R2_CANONICAL: R2Bucket };
export function hourCatalogKey(rev: string | null, file: string | null): string | null {
 if (!rev || !/^[a-f0-9]{16}$/.test(rev) || !file || !/^(manifest|catalog)\.json$/.test(file)) return null;
 return `hour-price-catalog/${rev}/${file}`;
}
export const onRequestGet: PagesFunction<Env> = async ctx => {
 const session = await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT);
 if (!session) return Response.json({ ok: false, code: 'AUTH_REQUIRED' }, { status: 401 });
 const url = new URL(ctx.request.url);
 const key = hourCatalogKey(url.searchParams.get('rev'), url.searchParams.get('f'));
 if (!key) return Response.json({ ok: false, code: 'HOUR_PATH_INVALID' }, { status: 400 });
 const object = await ctx.env.R2_CANONICAL.get(key);
 if (!object) return Response.json({ ok: false, code: 'HOUR_CATALOG_NOT_FOUND' }, { status: 404 });
 return new Response(object.body, { headers: { 'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'private, max-age=31536000, immutable' } });
};
