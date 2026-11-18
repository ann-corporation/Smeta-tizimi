import { normativEvidence, type NormativCandidate } from './normativ-evidence';
import { supabaseBaseUrl } from './supabase-url';
import { DEFAULT_PREFIX, docUuid, evidenceFor, findUnitBySha, loadCorpus, searchIndex } from './normativ-r2-index';

export type NormativEnv = { SUPABASE_URL: string; SUPABASE_KEY: string; NORMATIV_R2?: R2Bucket;
  NORMATIV_R2_PREFIX?: string; NORMATIV_R2_STATES?: string; NORMATIV_DB_FALLBACK?: string };
const json = (body: object, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const fail = (code: string, status: number) => json({ ok: false, code }, status);
export async function readNormativ(env: NormativEnv, actor: number, company: number, request: {
  q: string | null; edition: string | null; doc: string | null; sha: string | null; limit: number; publishedOnly?: boolean;
}): Promise<Response> {
  const { q, edition, doc, sha, limit, publishedOnly } = request;
  // Three-part estimate table references share the canonical 00-00-000 table format.
  const tableAlias = q?.match(/^[EЕ](\d{1,2})-(\d{1,2})-(\d{1,3})$/i);
  const search = tableAlias
    ? tableAlias.slice(1).map((part, index) => part.padStart(index === 2 ? 3 : 2, '0')).join('-')
    : q;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = <T>(work: Promise<T>) => Promise.race([
    work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('SOURCE_TIMEOUT')), 5000); }),
  ]);
  // Primary path: R2 search index (no database). The old DB tables are read only behind NORMATIV_DB_FALLBACK=1
  // and only while the R2 corpus is missing.
  try {
    const corpus = env.NORMATIV_R2 ? await timeout(loadCorpus(env.NORMATIV_R2, env.NORMATIV_R2_PREFIX || DEFAULT_PREFIX)) : null;
    if (corpus && env.NORMATIV_R2) {
      const bucket = env.NORMATIV_R2;
      const prefix = env.NORMATIV_R2_PREFIX || DEFAULT_PREFIX;
      const states = publishedOnly ? ['PUBLISHED'] : env.NORMATIV_R2_STATES ? env.NORMATIV_R2_STATES.split(',').map(s => s.trim()).filter(Boolean) : ['PUBLISHED', 'REVIEW_REQUIRED'];
      if (doc !== null && sha) {
        const found = corpus.docs.find(d => docUuid(d.source_sha) === doc && states.includes(d.state));
        const unit = found ? await timeout(findUnitBySha(bucket, found, sha, prefix)) : -1;
        if (!found || unit < 0) return json({ ok: true, code: 'UNKNOWN', sabab: 'NOT_FOUND', natijalar: [] });
        return json({ ok: true, natijalar: [await timeout(evidenceFor(bucket, { doc: found, unit, score: 0 }, [], company, prefix))] });
      }
      let result = await timeout(searchIndex(bucket, corpus, { q: q ?? '', tahrir: edition, limit, states, prefix }));
      if (result.hits.length === 0 && !result.reason && search !== q) {
        result = await timeout(searchIndex(bucket, corpus, { q: search ?? '', tahrir: edition, limit, states, prefix }));
      }
      if (result.hits.length === 0) return json({ ok: true, code: 'UNKNOWN', sabab: result.reason ?? 'NOT_FOUND', natijalar: [] });
      const evidence = await timeout(Promise.all(result.hits.map(hit => evidenceFor(bucket, hit, result.terms, company, prefix))));
      return json({ ok: true, natijalar: evidence });
    }
  } catch {
    return fail('SEARCH_UNAVAILABLE', 502);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
  if (env.NORMATIV_DB_FALLBACK !== '1') return fail('INDEX_UNAVAILABLE', 503);
  try {
    const query = async (reference: string | null) => {
      const result = await fetch(supabaseBaseUrl(env.SUPABASE_URL) + '/rest/v1/rpc/t2_normativ_qidir_v1', {
      // Cloudflare Workers fetch faqat 'follow' | 'manual' ni qabul qiladi ('error' -> TypeError, so'rov yuborilmaydi).
      // 'manual' + 3xx ni xato deb hisoblash — o'sha xavfsizlik (redirect'ga ergashilmaydi).
      method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(5000),
      headers: { apikey: env.SUPABASE_KEY, Authorization: 'Bearer ' + env.SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_actor_id: actor, p_kompaniya_id: company, p_q: reference, p_tahrir: edition,
        p_hujjat_id: doc, p_sha: sha, p_limit: limit,
      }),
    });
    if (!result.ok || result.status >= 300) throw new Error('SEARCH_UNAVAILABLE');
    return await result.json() as { ok?: boolean; code?: string; natijalar?: NormativCandidate[] };
    };
    let data = await query(q);
    if (search !== q && data.ok === true && data.natijalar?.length === 0 && !data.code) data = await query(search);
    if (data.ok === false && data.code === 'FORBIDDEN') return fail('FORBIDDEN', 403);
    if (data.ok !== true || !Array.isArray(data.natijalar) || data.natijalar.length > limit) {
      return fail('SEARCH_UNAVAILABLE', 502);
    }
    if (data.natijalar.length === 0) {
      const reason = data.code === 'EDITION_REQUIRED' || data.code === 'REFERENCE_AMBIGUOUS' ? data.code : 'NOT_FOUND';
      return json({ ok: true, code: 'UNKNOWN', sabab: reason, natijalar: [] });
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
}
