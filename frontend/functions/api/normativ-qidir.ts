import { tekshir } from '../_shared/auth';
import { DOCUMENT_ID, SHA256 } from '../_shared/normativ-evidence';
import { roleAuthority, sessiyaYaroqsizmi, yaroqsizSessiyaJavob } from '../_shared/role-authority';

import { readNormativ, type NormativEnv } from '../_shared/normativ-read';

type Env = NormativEnv & { SESSIYA_KALIT: string };
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
  return readNormativ(env, session.foydalanuvchi_id, company, { q, edition, doc, sha, limit });
};
