/**
 * GET /api/tajriba-indeks?f=<file>[&kompaniya_id=N] - serves the experience index (R2 normativ/tajriba/v1/) to a signed-in browser.
 *  - global layer: manifest.json.gz, e/sNN.json.gz, uzru.json.gz (k-anonymous: counts only).
 *  - company layer (kompaniya_id): c/<id>/... ONLY for a member of that company (or a superadmin). The private state file (holat.json.gz)
 *    and the nightly cursor file are never served.
 * Bytes are returned opaque (gzip); the client verifies every shard against the manifest sha256.
 */
import { tekshir } from '../_shared/auth';

type Env = { SESSIYA_KALIT: string; R2_CANONICAL: R2Bucket };

const PREFIX = 'normativ/tajriba/v1/';
const FAYL = /^(?:manifest\.json\.gz|uzru\.json\.gz|e\/s\d{2}\.json\.gz)$/;

export function tajribaKalit(f: string | null, kompaniya: number | null): string | null {
  if (!f || !FAYL.test(f)) return null;
  if (kompaniya == null) return PREFIX + f;
  return Number.isSafeInteger(kompaniya) && kompaniya > 0 ? `${PREFIX}c/${kompaniya}/${f}` : null;
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const sess = await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT);
  if (!sess) return Response.json({ ok: false, code: 'AUTH_REQUIRED' }, { status: 401 });
  const url = new URL(ctx.request.url);
  if (url.searchParams.getAll('f').length > 1 || url.searchParams.getAll('kompaniya_id').length > 1) return Response.json({ ok: false, code: 'TAJRIBA_PATH_INVALID' }, { status: 400 });
  const kRaw = url.searchParams.get('kompaniya_id');
  const kompaniya = kRaw == null ? null : /^[1-9]\d{0,15}$/.test(kRaw) ? Number(kRaw) : NaN;
  const key = Number.isNaN(kompaniya) ? null : tajribaKalit(url.searchParams.get('f'), kompaniya);
  if (!key) return Response.json({ ok: false, code: 'TAJRIBA_PATH_INVALID' }, { status: 400 });
  if (kompaniya != null && sess.rol !== 'superadmin' && !(sess.kompaniyalar ?? []).some(k => k.kompaniya_id === kompaniya)) {
    return Response.json({ ok: false, code: 'FORBIDDEN' }, { status: 403 });
  }
  const obj = await ctx.env.R2_CANONICAL.get(key);
  if (!obj) return Response.json({ ok: false, code: 'TAJRIBA_NOT_FOUND' }, { status: 404 });
  return new Response(obj.body, { headers: {
    'Content-Type': 'application/octet-stream',
    'Cache-Control': 'private, max-age=300, no-transform',
    'X-Content-Type-Options': 'nosniff',
  } });
};
