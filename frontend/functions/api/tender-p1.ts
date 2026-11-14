/**
 * /api/tender-p1 — ochiq tender: xaridor amallari (lot smeta bo'limidan, aloqa, narx manbasi, ish topshirig'i/shartnoma havolasi, kelishuv signallari, bayonnoma).
 * POST { amal, kompaniya_id, operation_id?, data }. Actor SESSIYADAN. Faqat t2_tn_* RPC (oq ro'yxat); a'zolik/ruxsat/tenant/muhr RPC ichida (acceptance 20261216510000).
 */
import { tekshir } from '../_shared/auth';
import { supabaseBaseUrl } from '../_shared/supabase-url';
import { quraRpc, xatoHolati } from '../_shared/tender-ochiq';

type Env = { SESSIYA_KALIT: string; SUPABASE_URL: string; SUPABASE_KEY: string };
const NO_STORE = { 'Cache-Control': 'no-store' };
const json = (b: unknown, status = 200) => Response.json(b, { status, headers: NO_STORE });

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const sess = await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT);
  if (!sess) return json({ ok: false, code: 'AUTH_REQUIRED' }, 401);
  let so: Record<string, unknown> = {};
  try { so = await ctx.request.json(); } catch { return json({ ok: false, code: 'BODY_INVALID' }, 400); }
  const actorId = Number(sess.foydalanuvchi_id);
  if (!Number.isSafeInteger(actorId) || actorId <= 0) return json({ ok: false, code: 'AUTH_REQUIRED' }, 401);
  const q = quraRpc(so.amal, actorId, so);
  if (!q.ok) return json({ ok: false, code: q.code }, 400);
  try {
    const r = await fetch(supabaseBaseUrl(ctx.env.SUPABASE_URL) + '/rest/v1/rpc/' + q.rpc, {
      method: 'POST', headers: { apikey: ctx.env.SUPABASE_KEY, Authorization: 'Bearer ' + ctx.env.SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(q.body),
    });
    if (r.status === 404) return json({ ok: false, code: 'SERVER_YANGILANMAGAN' }, 503);
    if (!r.ok) {
      const e = await r.json().catch(() => null) as { code?: string } | null;
      const st = xatoHolati(e?.code);
      return json({ ok: false, code: st === 403 ? 'PERMISSION_DENIED' : 'SERVER_XATO' }, st);
    }
    const j = await r.json() as Record<string, unknown> | null;
    if (!j || typeof j !== 'object') return json({ ok: false, code: 'SERVER_XATO' }, 500);
    return json({ ok: true, natija: j });
  } catch { return json({ ok: false, code: 'SERVER_XATO' }, 500); }
};
