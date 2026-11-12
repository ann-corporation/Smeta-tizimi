/**
 * muhr-isit.ts — SMETA CONST: sovuq muhr qatori (yuklamasi R2 da) keyin o'zgargan/o'chirilgan bo'lsa, asl qiymatni R2 dan bazaga qaytaradi
 * ("isitish"), shunda `t2_qator_muhr_farq` view'i to'liq avval/endi ni beradi. Dizayn: docs/architecture/ADR_MUHR_R2.md §4.
 * Faqat kirgan foydalanuvchi (sessiya); qiymat javobda QAYTMAYDI — faqat son. Xavfsiz: R2 matni sha256 ga, har qator xeshi muhrga teng bo'lsagina
 * yoziladi (DB ham, trigger ham tekshiradi); takror chaqiriq zararsiz (idempotent). Cheklangan bo'lak (blok limiti). Kunlik cron ham shuni qiladi.
 *   POST { obyekt_id }  ->  { ok: true, isitildi: <qator soni>, blok: <blok soni>, xato: <soni> }
 */
import { tekshir } from '../_shared/auth';
import { supabaseBaseUrl } from '../_shared/supabase-url';
import { isitObyekt, type IsitBlok, type MuhrAloqa } from '../../src/lib/qator-muhr-r2/sovuq';

type Env = { SESSIYA_KALIT: string; SUPABASE_URL: string; SUPABASE_KEY: string; R2_CANONICAL?: R2Bucket };

export const BLOK_LIMIT = 3;
const xato = (code: string, status = 400) => Response.json({ ok: false, code }, { status });

/** PostgREST RPC orqali MuhrAloqa (Pages Function'da xom SQL yo'q). */
export function restAloqa(env: Pick<Env, 'SUPABASE_URL' | 'SUPABASE_KEY'>, fetchFn: typeof fetch = fetch): MuhrAloqa {
  const rpc = async (nom: string, args: Record<string, unknown>): Promise<unknown> => {
    const r = await fetchFn(supabaseBaseUrl(env.SUPABASE_URL) + '/rest/v1/rpc/' + nom, {
      method: 'POST', headers: { apikey: env.SUPABASE_KEY, Authorization: 'Bearer ' + env.SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    if (!r.ok) throw new Error(`RPC_${nom}_${r.status}`);
    return r.json();
  };
  return {
    async nomzod(obyektId, limit): Promise<IsitBlok[]> {
      const rows = await rpc('t2_qator_muhr_isit_nomzod_v1', { p_obyekt_id: obyektId, p_limit: limit });
      return (Array.isArray(rows) ? rows : []).map((x: Record<string, unknown>) => ({
        sovuq_id: String(x.sovuq_id), r2_key: String(x.r2_key), r2_sha256: String(x.r2_sha256),
        idlar: Array.isArray(x.idlar) ? x.idlar.map(String) : [],
      }));
    },
    async isit(sovuqId, matn, sha256, idlar) {
      const n = await rpc('t2_qator_muhr_isit_v1', { p_sovuq_id: Number(sovuqId), p_matn: matn, p_sha256: sha256, p_idlar: idlar && idlar.length ? idlar.map(Number) : null });
      return Number(n ?? 0);
    },
  };
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const s = await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT).catch(() => null);
  if (!s) return xato('AUTH_REQUIRED', 401);
  if (!ctx.env.SUPABASE_URL || !ctx.env.SUPABASE_KEY || !ctx.env.R2_CANONICAL) return xato('CONFIG', 503);
  const so = await ctx.request.json().catch(() => null) as { obyekt_id?: unknown } | null;
  const obyektId = Number(so?.obyekt_id);
  if (!Number.isSafeInteger(obyektId) || obyektId <= 0) return xato('OBYEKT_ID_NOTOGRI');
  const r2 = { get: async (k: string) => { const o = await ctx.env.R2_CANONICAL!.get(k); return o ? new Uint8Array(await o.arrayBuffer()) : null; } };
  try {
    const n = await isitObyekt(restAloqa(ctx.env), r2, obyektId, { limit: BLOK_LIMIT });
    return Response.json({ ok: true, isitildi: n.qator, blok: n.blok, xato: n.xato }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return xato('ISITISH_OLINMADI', 502);
  }
};
