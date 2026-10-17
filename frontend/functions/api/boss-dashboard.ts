/**
 * boss-dashboard.ts — BOSS PANEL P0: canonical director dashboard.
 * session -> actor -> Supabase RPC t2_boss_dashboard_v1. No Drive/Sheets/GAS.
 *
 *   GET /api/boss-dashboard?kompaniya_id=<n>   (session cookie)
 */
import { cachedAuthority } from '../_shared/permission-policy';
import { tekshir } from '../_shared/auth';
import { supabaseBaseUrl } from '../_shared/supabase-url';
import { xavfsizUpstream, xavfsizXato } from '../_shared/xato';

type Env = { SUPABASE_URL: string; SUPABASE_KEY: string; SESSIYA_KALIT: string };

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  try {
    const sess = cachedAuthority(ctx) ?? await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT);
    if (!sess) return Response.json({ ok: false, code: 'AUTH_REQUIRED' }, { status: 401 });
    const actorId = (sess as any).foydalanuvchi_id;
    if (actorId == null) return Response.json({ ok: false, code: 'AUTH_REQUIRED', xato: 'Sessiyada foydalanuvchi yo‘q — qayta kiring' }, { status: 401 });
    if (!ctx.env.SUPABASE_URL || !ctx.env.SUPABASE_KEY) return Response.json({ ok: false, code: 'CONFIG' }, { status: 500 });

    const kompaniyaId = Number(new URL(ctx.request.url).searchParams.get('kompaniya_id'));
    if (!kompaniyaId) return Response.json({ ok: false, code: 'COMPANY_CONTEXT_REQUIRED' }, { status: 400 });

    const r = await fetch(supabaseBaseUrl(ctx.env.SUPABASE_URL) + '/rest/v1/rpc/t2_boss_dashboard_v1', {
      method: 'POST',
      headers: { apikey: ctx.env.SUPABASE_KEY, Authorization: 'Bearer ' + ctx.env.SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_kompaniya_id: kompaniyaId, p_actor_id: actorId }),
    });
    const text = await r.text();
    let j: any = null;
    try { j = JSON.parse(text); } catch { /* keep raw */ }
    if (!r.ok || !j || j.ok !== true) {
      const code = (j && j.code) || 'BOSS_DASHBOARD_FAILED';
      const status = code === 'COMPANY_NOT_FOUND' ? 404 : /actor|a'zo|azo|membership/i.test(code + text) ? 403 : 502;
      return xavfsizUpstream(r.status, j || text, status);
    }
    return Response.json(j);
  } catch (err: any) {
    return xavfsizXato('BOSS_DASHBOARD_FAILED', 500, err?.message || String(err));
  }
};
