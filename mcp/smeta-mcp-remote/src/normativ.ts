import { readNormativ } from '../../../frontend/functions/_shared/normativ-read';
import type { Muhit } from '../../smeta-mcp/src/muhit';
import type { Env } from './env';
import type { Vakolat } from './vakolat';

/** Same authoritative R2/PUBLISHED reader as the website; no second search implementation. */
export function normativUla(mu: Muhit, env: Pick<Env, 'SUPABASE_URL' | 'SUPABASE_KEY' | 'SNAPSHOT_R2' | 'NORMATIV_R2_PREFIX' | 'NORMATIV_DB_FALLBACK'>,
  authority: Pick<Vakolat, 'foydalanuvchiId' | 'kompaniyalar'>) {
  mu.normativQidir = async (company, query, limit, edition) => {
    if (mu.aktorId !== authority.foydalanuvchiId || !authority.kompaniyalar.some(k => k.kompaniya_id === company)) throw new Error('RUXSAT_YOQ');
    const response = await readNormativ({ SUPABASE_URL: env.SUPABASE_URL, SUPABASE_KEY: env.SUPABASE_KEY,
      NORMATIV_R2: env.SNAPSHOT_R2, NORMATIV_R2_PREFIX: env.NORMATIV_R2_PREFIX,
      NORMATIV_DB_FALLBACK: env.NORMATIV_DB_FALLBACK,
    }, authority.foydalanuvchiId, company, { q: query, edition: edition ?? null, doc: null, sha: null, limit, publishedOnly: true });
    const body = await response.json() as Record<string, unknown>;
    if (!response.ok || body.ok !== true) throw new Error('NORMATIV_SOURCE_UNAVAILABLE');
    return body;
  };
}
