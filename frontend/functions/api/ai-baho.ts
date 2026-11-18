/**
 * POST /api/ai-baho - AI javobiga yoqdi/yoqmadi bahosi (t2_agent_fikr, baho ustuni). Foydalanuvchi matni va AI javobi SAQLANMAYDI:
 * faqat baho (+1/-1), yuza (jarvis|smeta_ai|...) va ixtiyoriy sabab kodi. Actor FAQAT sessiyadan; kompaniya a'zoligi shu yerda va bazada
 * (t2_agent_scope_guard_v1) tekshiriladi; origin tekshiruvi; kuniga 200 baho/foydalanuvchi (SQL).
 * Body: { baho: 'yoqdi'|'yoqmadi'|1|-1, yuza: 'jarvis', sabab?: 'tushunarsiz'|'notogri'|'sekin'|'boshqa', kompaniya_id? }
 */
import { cachedAuthority } from '../_shared/permission-policy';
import { tekshir } from '../_shared/auth';
import { supabaseBaseUrl } from '../_shared/supabase-url';

type Env = { SESSIYA_KALIT: string; SUPABASE_URL: string; SUPABASE_KEY: string };
const javob = (d: unknown, status = 200) => Response.json(d, { status, headers: { 'Cache-Control': 'no-store' } });
const SABABLAR = new Set(['tushunarsiz', 'notogri', 'sekin', 'boshqa']);

export function bahoQiymati(v: unknown): 1 | -1 | null {
  if (v === 1 || v === 'yoqdi' || v === 'up') return 1;
  if (v === -1 || v === 'yoqmadi' || v === 'down') return -1;
  return null;
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const origin = ctx.request.headers.get('Origin');
  if (ctx.request.headers.get('Sec-Fetch-Site') === 'cross-site' || (origin && origin !== new URL(ctx.request.url).origin)) return javob({ ok: false, code: 'ORIGIN_INVALID' }, 403);
  const sess = cachedAuthority(ctx) ?? await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT).catch(() => null);
  if (!sess || !Number.isSafeInteger(sess.foydalanuvchi_id) || Number(sess.foydalanuvchi_id) <= 0) return javob({ ok: false, code: 'AUTH_REQUIRED' }, 401);
  if (!ctx.env.SUPABASE_URL || !ctx.env.SUPABASE_KEY) return javob({ ok: false, code: 'SERVER_SOZLANMAGAN' }, 503);
  let b: { baho?: unknown; yuza?: unknown; sabab?: unknown; kompaniya_id?: unknown };
  try { b = await ctx.request.json(); } catch { return javob({ ok: false, code: 'JSON_INVALID' }, 400); }
  const baho = bahoQiymati(b.baho);
  if (baho === null) return javob({ ok: false, code: 'BAHO_INVALID' }, 400);
  const yuza = typeof b.yuza === 'string' && /^[a-z_]{2,30}$/.test(b.yuza) ? b.yuza : null;
  if (!yuza) return javob({ ok: false, code: 'YUZA_INVALID' }, 400);
  const sabab = b.sabab == null ? null : (typeof b.sabab === 'string' && SABABLAR.has(b.sabab) ? b.sabab : undefined);
  if (sabab === undefined) return javob({ ok: false, code: 'SABAB_INVALID' }, 400);
  if (!Array.isArray(sess.kompaniyalar)) return javob({ ok: false, code: 'AUTHORITY_UNAVAILABLE' }, 403);
  const so = b.kompaniya_id == null ? null : Number(b.kompaniya_id);
  if (b.kompaniya_id != null && !(Number.isSafeInteger(so) && Number(so) > 0)) return javob({ ok: false, code: 'KOMPANIYA_INVALID' }, 400);
  const kid = so ?? (sess.kompaniyalar.length === 1 ? sess.kompaniyalar[0].kompaniya_id : null);
  if (!kid) return javob({ ok: false, code: 'KOMPANIYA_KERAK' }, 422);
  if (!sess.kompaniyalar.some((c) => c.kompaniya_id === kid)) return javob({ ok: false, code: 'COMPANY_ACCESS_DENIED' }, 403);
  const r = await fetch(supabaseBaseUrl(ctx.env.SUPABASE_URL) + '/rest/v1/rpc/t2_ai_baho_yoz_v1', {
    method: 'POST', headers: { apikey: ctx.env.SUPABASE_KEY, Authorization: 'Bearer ' + ctx.env.SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_actor_id: Number(sess.foydalanuvchi_id), p_kompaniya_id: kid, p_baho: baho, p_yuza: yuza, p_sabab: sabab }),
  }).catch(() => null);
  const j = (r && r.ok ? await r.json().catch(() => null) : null) as { ok?: boolean; code?: string } | null;
  if (!j) return javob({ ok: false, code: 'BAHO_YOZILMADI' }, 502);
  if (j.ok !== true) return javob({ ok: false, code: String(j.code ?? 'BAHO_RAD') }, j.code === 'LIMIT' ? 429 : 403);
  return javob({ ok: true });
};
