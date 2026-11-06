import { tekshir } from '../_shared/auth';
import { normativEvidence, DOCUMENT_ID, SHA256, type NormativCandidate } from '../_shared/normativ-evidence';
import { roleAuthority, sessiyaYaroqsizmi, yaroqsizSessiyaJavob } from '../_shared/role-authority';
import { supabaseBaseUrl } from '../_shared/supabase-url';

type Env = { SESSIYA_KALIT: string; SUPABASE_URL: string; SUPABASE_KEY: string; NORMATIV_R2?: R2Bucket };
const json = (body: object, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const fail = (code: string, status: number) => json({ ok: false, code }, status);
const fields = new Set(['kompaniya_id', 'q', 'tahrir', 'hujjat_id', 'sha256', 'limit']);

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const session = await tekshir(request.headers.get('Cookie'), env.SESSIYA_KALIT);
  if (!session?.foydalanuvchi_id) return fail('AUTH_REQUIRED', 401);
  const params = new URL(request.url).searchParams;
  for (const key of params.keys()) {
    if (!fields.has(key) || params.getAll(key).length !== 1) return fail('INPUT_INVALID', 400);
  }
  const companyText = params.get('kompaniya_id') ?? '';
  const company = Number(companyText);
  const q = params.get('q')?.trim() ?? null;
  const edition = params.get('tahrir')?.trim() ?? null;
  const doc = params.get('hujjat_id');
  const sha = params.get('sha256');
  const limitText = params.get('limit') ?? (doc === null ? '3' : '1');
  const limit = Number(limitText);
  if (!/^[1-9]\d*$/.test(companyText) || !Number.isSafeInteger(company) || !/^[1-4]$/.test(limitText) ||
      (doc === null && (!q || q.length < 2 || q.length > 120 || sha !== null ||
        (edition !== null && (!edition || edition.length > 120)))) ||
      (doc !== null && (!DOCUMENT_ID.test(doc) || !sha || !SHA256.test(sha) || q !== null || edition !== null || limit !== 1))) {
    return fail('INPUT_INVALID', 400);
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return fail('SERVICE_UNAVAILABLE', 503);
  const authority = await roleAuthority(session, env);
  if (!authority) return sessiyaYaroqsizmi(session) ? yaroqsizSessiyaJavob() : fail('AUTHORITY_UNAVAILABLE', 503);
  if (authority.rol !== 'superadmin' && !authority.permissionsByCompany?.[company]?.includes('company.read')) {
    return fail('FORBIDDEN', 403);
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await fetch(supabaseBaseUrl(env.SUPABASE_URL) + '/rest/v1/rpc/t2_normativ_qidir_v1', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
      headers: { apikey: env.SUPABASE_KEY, Authorization: 'Bearer ' + env.SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_actor_id: authority.foydalanuvchi_id, p_kompaniya_id: company, p_q: q, p_tahrir: edition,
        p_hujjat_id: doc, p_sha: sha, p_limit: limit,
      }),
    });
    if (!result.ok) return fail('SEARCH_UNAVAILABLE', 502);
    const data = await result.json() as { ok?: boolean; code?: string; natijalar?: NormativCandidate[] };
    if (data.ok === false && data.code === 'FORBIDDEN') return fail('FORBIDDEN', 403);
    if (data.ok !== true || !Array.isArray(data.natijalar) || data.natijalar.length > limit) {
      return fail('SEARCH_UNAVAILABLE', 502);
    }
    if (data.natijalar.length === 0) {
      return json({ ok: true, code: 'UNKNOWN', sabab: data.code === 'EDITION_REQUIRED' ? data.code : 'NOT_FOUND', natijalar: [] });
    }
    if (!env.NORMATIV_R2) return fail('SOURCE_UNAVAILABLE', 503);
    const bucket = env.NORMATIV_R2;
    const evidence = await Promise.race([
      Promise.all(data.natijalar.map(row => normativEvidence(bucket, row, company))),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('SOURCE_TIMEOUT')), 5000); }),
    ]).catch(() => null);
    return evidence ? json({ ok: true, natijalar: evidence }) : fail('SOURCE_UNAVAILABLE', 502);
  } catch {
    return fail('SEARCH_UNAVAILABLE', 502);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
};
