/**
 * POST /api/tajriba-tick - nightly experience-index job (GitHub Actions .github/workflows/tajriba-tungi.yml, 21:50 UTC).
 *  - Access ONLY with `X-Cron-Kalit` (BILDIRISHNOMA_CRON_KALIT, the same secret as telegram-kunlik / arxiv-tungi): unset 503, wrong 403.
 *  - Window 21:00-23:59 UTC (body.majbur=true lets the owner run it by hand).
 *  - Reads the DB through three READ-ONLY RPCs (NOT APPLIED yet: supabase/manual/NOT_APPLIED_t2_tajriba_indeks_oqish_v1.sql); writes R2 only.
 *  - The reply holds counts only (no wording, no name).
 */
import { cronKalitTekshir } from './bildirishnoma-yetkaz';
import { supabaseBaseUrl } from '../_shared/supabase-url';
import { r2Oqi, r2Yoz } from '../_shared/r2-saqlash';
import { tajribaTickIsh, type TajribaDeps } from '../_shared/tajriba-tick';

type Env = { SUPABASE_URL: string; SUPABASE_KEY: string; R2_CANONICAL?: R2Bucket; BILDIRISHNOMA_CRON_KALIT?: string };
const javob = (d: unknown, status = 200) => Response.json(d, { status, headers: { 'Cache-Control': 'no-store' } });

export function depsYarat(env: Env, fetchFn: typeof fetch = fetch): TajribaDeps {
  const baza = supabaseBaseUrl(env.SUPABASE_URL) + '/rest/v1/rpc/';
  const sarlavha = { apikey: env.SUPABASE_KEY, Authorization: 'Bearer ' + env.SUPABASE_KEY, 'Content-Type': 'application/json' };
  const b = env.R2_CANONICAL as R2Bucket;
  return {
    async rpc(nom, args) {
      const r = await fetchFn(baza + nom, { method: 'POST', headers: sarlavha, body: JSON.stringify(args) });
      if (!r.ok) throw new Error('RPC_' + nom + '_' + r.status);
      return r.json();
    },
    r2: {
      get: async (k) => { const o = await r2Oqi(b, k); return o ? new Uint8Array(await o.arrayBuffer()) : null; },
      put: async (k, bayt) => { await r2Yoz(b, k, bayt, { httpMetadata: { contentType: 'application/gzip' } }); },
    },
  };
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const env = ctx.env;
  const k = cronKalitTekshir(ctx.request, env.BILDIRISHNOMA_CRON_KALIT);
  if (k === 'sozlanmagan') return javob({ ok: false, code: 'SOZLANMAGAN' }, 503);
  if (k === 'rad') return javob({ ok: false, code: 'RAD' }, 403);
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY || !env.R2_CANONICAL) return javob({ ok: false, code: 'SERVER_SOZLANMAGAN' }, 503);
  let b: { majbur?: unknown } = {};
  try { b = await ctx.request.json(); } catch { b = {}; }
  try {
    return javob(await tajribaTickIsh(depsYarat(env), new Date(), { majbur: b.majbur === true }));
  } catch {
    return javob({ ok: false, code: 'ISH_XATO' }, 500);
  }
};
