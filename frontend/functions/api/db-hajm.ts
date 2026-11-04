/**
 * db-hajm.ts — baza hajmi monitoringi (saqlash dietasi): hajm + eng katta jadvallar. Faqat platforma superadmini (har chaqiruvda
 * bazada qayta tekshiriladi). Faqat o'qiydi. Chegara: DB_LIMIT_MB muhit o'zgaruvchisi (standart 500 — Supabase Free).
 */
import { superadminActor, type SuperadminEnv } from '../_shared/superadmin';
import { supabaseBaseUrl } from '../_shared/supabase-url';

type Env = SuperadminEnv & { DB_LIMIT_MB?: string };
const MB = 1024 * 1024;

export const darajaOl = (foiz: number): 'ok' | 'ogoh' | 'xavf' => (foiz >= 90 ? 'xavf' : foiz >= 80 ? 'ogoh' : 'ok');

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const actor = await superadminActor(ctx.request, ctx.env);
  if ('code' in actor) return Response.json({ ok: false, code: actor.code }, { status: actor.status, headers: { 'Cache-Control': 'no-store' } });
  const r = await fetch(supabaseBaseUrl(ctx.env.SUPABASE_URL) + '/rest/v1/rpc/t2_db_hajm_v1', {
    method: 'POST', headers: { apikey: ctx.env.SUPABASE_KEY, Authorization: 'Bearer ' + ctx.env.SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_actor_id: actor.id }),
  });
  const j = (r.ok ? await r.json().catch(() => null) : null) as { ok?: boolean; code?: string; db_bytes?: number; top?: unknown[]; snapshot_sovuq?: unknown } | null;
  if (!j || j.ok !== true) return Response.json({ ok: false, code: String(j?.code ?? 'HAJM_OLINMADI') }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  const lim = Number(ctx.env.DB_LIMIT_MB);
  const limitBytes = (Number.isFinite(lim) && lim > 0 ? lim : 500) * MB;
  const foiz = Math.round((Number(j.db_bytes) / limitBytes) * 1000) / 10;
  return Response.json({ ok: true, db_bytes: Number(j.db_bytes), limit_bytes: limitBytes, foiz, daraja: darajaOl(foiz), top: j.top ?? [], snapshot_sovuq: j.snapshot_sovuq ?? null },
    { headers: { 'Cache-Control': 'no-store' } });
};
