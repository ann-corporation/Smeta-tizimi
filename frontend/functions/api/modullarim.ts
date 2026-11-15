/**
 * modullarim.ts — FOYDALANUVCHI TANLAGAN ILOVALAR (pin) va TARTIB. Veb, Android, Windows va Telegram bot BIR XIL endpoint.
 *   GET  /api/modullarim?kompaniya_id=N                                  -> { ok, tanlangan: string[], tartib: string[], versiya }
 *   POST { kompaniya_id, tanlangan: string[], tartib: string[], expected_version } -> { ok, versiya } | STALE_VERSION (409)
 * Faqat KO'RINISH tanlovi (t2_modul_tanlov_*_v1, migratsiya 20261224000000 — tasdiq kutadi). Ruxsat/ilova yoqilganligini
 * O'ZGARTIRMAYDI. Actor har doim sessiyadan; a'zolik SQL da tekshiriladi.
 */
import { tekshir } from '../_shared/auth';
import { supabaseBaseUrl } from '../_shared/supabase-url';

type Env = { SUPABASE_URL: string; SUPABASE_KEY: string; SESSIYA_KALIT: string };
const KOD = /^[a-z0-9_.]{2,40}$/;
const json = (b: unknown, status = 200) => Response.json(b, { status, headers: { 'Cache-Control': 'no-store' } });

async function rpc(env: Env, nom: string, body: unknown) {
  const r = await fetch(supabaseBaseUrl(env.SUPABASE_URL) + '/rest/v1/rpc/' + nom, {
    method: 'POST', headers: { apikey: env.SUPABASE_KEY, Authorization: 'Bearer ' + env.SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => null) as Record<string, unknown> | null;
  return { status: r.status, j };
}
async function actor(request: Request, env: Env): Promise<number | Response> {
  const s = await tekshir(request.headers.get('Cookie'), env.SESSIYA_KALIT).catch(() => null);
  const id = Number(s?.foydalanuvchi_id);
  return Number.isSafeInteger(id) && id > 0 ? id : json({ ok: false, code: 'AUTH_REQUIRED' }, 401);
}
const holat = (code: unknown) => code === 'AZO_EMAS' ? 403 : code === 'STALE_VERSION' ? 409 : code === 'AUTH_REQUIRED' ? 401 : 400;

export const onRequestGet: PagesFunction<Env> = async ctx => {
  const a = await actor(ctx.request, ctx.env); if (a instanceof Response) return a;
  const kid = Number(new URL(ctx.request.url).searchParams.get('kompaniya_id'));
  if (!Number.isSafeInteger(kid) || kid <= 0) return json({ ok: false, code: 'KOMPANIYA_KERAK' }, 400);
  const { status, j } = await rpc(ctx.env, 't2_modul_tanlov_oqi_v1', { p_actor_id: a, p_kompaniya_id: kid });
  if (!j || status >= 500) return json({ ok: false, code: 'UPSTREAM' }, 502);
  return j.ok === true ? json(j) : json({ ok: false, code: j.code }, holat(j.code));
};

export const onRequestPost: PagesFunction<Env> = async ctx => {
  const a = await actor(ctx.request, ctx.env); if (a instanceof Response) return a;
  let b: Record<string, unknown>;
  try { b = await ctx.request.json() as Record<string, unknown>; } catch { return json({ ok: false, code: 'BODY_INVALID' }, 400); }
  const kid = Number(b?.kompaniya_id);
  const list = (v: unknown): string[] | null => Array.isArray(v) && v.length <= 40 && v.every(x => typeof x === 'string' && KOD.test(x)) ? v as string[] : null;
  const tanlangan = list(b?.tanlangan), tartib = list(b?.tartib);
  const ver = Number(b?.expected_version);
  if (!Number.isSafeInteger(kid) || kid <= 0 || !tanlangan || !tartib || !Number.isSafeInteger(ver) || ver < 0) return json({ ok: false, code: 'REQUEST_INVALID' }, 400);
  const { status, j } = await rpc(ctx.env, 't2_modul_tanlov_yoz_v1', { p_actor_id: a, p_kompaniya_id: kid, p_tanlangan: tanlangan, p_tartib: tartib, p_expected_version: ver });
  if (!j || status >= 500) return json({ ok: false, code: 'UPSTREAM' }, 502);
  return j.ok === true ? json(j) : json({ ok: false, code: j.code, versiya: j.versiya }, holat(j.code));
};
