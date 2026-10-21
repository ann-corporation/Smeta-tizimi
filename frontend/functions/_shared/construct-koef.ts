import { tekshir } from './auth';
import { CONSTRUCT_REFERENCE, constructCandidates, constructWorkKey, type ConstructPayload } from '../../src/lib/smeta-studio/construct-koef';
export const CONSTRUCT_KEY = `reference-data/construct-coefficients/${CONSTRUCT_REFERENCE.sha256}/reference.json`;
type Env = { SESSIYA_KALIT: string; R2_CANONICAL: R2Bucket };
const fail = (code: string, status: number) => Response.json({ ok: false, code }, { status, headers: { 'Cache-Control': 'no-store' } });

export const constructReferenceGet: PagesFunction<Env> = async ctx => {
  if (!await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT)) return fail('AUTH_REQUIRED', 401);
  const url = new URL(ctx.request.url), work = url.searchParams.get('work') ?? '';
  const page = (name: string, defaultValue: number) => {
    const value = url.searchParams.get(name);
    return value == null ? defaultValue : /^\d{1,7}$/.test(value) ? Number(value) : NaN;
  };
  const limit = page('limit', 20), offset = page('offset', 0);
  if (!constructWorkKey(work) || !Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0)
    return fail('REFERENCE_QUERY_INVALID', 400);
  try {
    const object = await ctx.env.R2_CANONICAL.get(CONSTRUCT_KEY);
    if (!object) return fail('REFERENCE_NOT_PUBLISHED', 503);
    if (object.size > 1_500_000) return fail('REFERENCE_SIZE_INVALID', 502);
    const bytes = await object.arrayBuffer();
    if (bytes.byteLength > 1_500_000) return fail('REFERENCE_SIZE_INVALID', 502);
    const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
    if (digest !== CONSTRUCT_REFERENCE.sha256) return fail('REFERENCE_HASH_MISMATCH', 502);
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as ConstructPayload;
    if (payload.schema !== 'construct-coefficient-reference-v1' || payload.calculation_approved !== false
      || payload.source_sha256 !== CONSTRUCT_REFERENCE.sourceSha256) return fail('REFERENCE_SCHEMA_INVALID', 502);
    return Response.json(constructCandidates(payload, work, limit, offset), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return fail('REFERENCE_UNAVAILABLE', 502); }
};
