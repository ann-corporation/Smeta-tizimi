/**
 * hujjat-royxat.ts — DOCUMENT CENTER canonical registry read.
 * session -> actor -> Supabase t2_document_registry_v1. No Drive/Sheets/GAS.
 *
 *   GET /api/hujjat-royxat?kompaniya_id=<n>[&loyiha_id=<n>][&obyekt_id=<n>][&limit=<n>]
 *
 * A failed Drive replica is reported inside `health`, never as a canonical
 * document failure.
 */
import { cachedAuthority } from '../_shared/permission-policy';
import { tekshir } from '../_shared/auth';
import { supabaseBaseUrl } from '../_shared/supabase-url';

type Env = { SUPABASE_URL: string; SUPABASE_KEY: string; SESSIYA_KALIT: string };

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  try {
    const sess = cachedAuthority(ctx) ?? await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT);
    if (!sess) return Response.json({ ok: false, code: 'AUTH_REQUIRED' }, { status: 401 });
    const actorId = (sess as any).foydalanuvchi_id;
    if (actorId == null) return Response.json({ ok: false, code: 'AUTH_REQUIRED', xato: 'Sessiyada foydalanuvchi yo‘q — qayta kiring' }, { status: 401 });
    if (!ctx.env.SUPABASE_URL || !ctx.env.SUPABASE_KEY) return Response.json({ ok: false, code: 'CONFIG' }, { status: 500 });

    const u = new URL(ctx.request.url);
    const kompaniyaId = Number(u.searchParams.get('kompaniya_id'));
    if (!kompaniyaId) return Response.json({ ok: false, code: 'COMPANY_CONTEXT_REQUIRED' }, { status: 400 });
    const loyihaId = u.searchParams.get('loyiha_id') ? Number(u.searchParams.get('loyiha_id')) : null;
    const obyektId = u.searchParams.get('obyekt_id') ? Number(u.searchParams.get('obyekt_id')) : null;
    const limit = u.searchParams.get('limit') ? Number(u.searchParams.get('limit')) : 200;

    const r = await fetch(supabaseBaseUrl(ctx.env.SUPABASE_URL) + '/rest/v1/rpc/t2_document_registry_v1', {
      method: 'POST',
      headers: { apikey: ctx.env.SUPABASE_KEY, Authorization: 'Bearer ' + ctx.env.SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_actor_id: actorId, p_kompaniya_id: kompaniyaId, p_loyiha_id: loyihaId, p_obyekt_id: obyektId, p_limit: limit }),
    });
    const text = await r.text();
    let j: any = null;
    try { j = JSON.parse(text); } catch { /* keep raw */ }
    if (!r.ok || !j || j.ok !== true) {
      const code = (j && j.code) || 'DOCUMENT_REGISTRY_FAILED';
      const status = /42501|a'zo|azo|membership/i.test(code + text) ? 403 : 502;
      return Response.json({ ok: false, code, xato: (j && j.message) || text.slice(0, 200) }, { status });
    }
    return Response.json(j);
  } catch (err: any) {
    return Response.json({ ok: false, code: 'DOCUMENT_REGISTRY_FAILED', xato: String(err?.message || err) }, { status: 500 });
  }
};
