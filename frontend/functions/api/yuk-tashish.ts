/**
 * /api/yuk-tashish — Logistika P1: haydovchi (yakka yoki firma) va yuk egasi amallari. POST { amal, kompaniya_id?, operation_id?, data }.
 * Actor SESSIYADAN (so'rov tanasidan hech qachon). Haydovchi amallari kompaniya a'zoligini talab qilmaydi; yuk egasi amallarida a'zolik va
 * procurement.* ruxsatini RPC ichida baza tekshiradi. /admin smeta ma'lumotiga bu yo'ldan kirib bo'lmaydi (faqat t2_yb_* RPC lar, oq ro'yxat).
 * Permission middleware ro'yxatida emas: SCOPED_APIS faqat kompaniya ma'lumoti uchun (yuk-marshrut/profil kabi). Joy yuborish: 5 s da bittadan.
 */
import { tekshir } from '../_shared/auth';
import { supabaseBaseUrl } from '../_shared/supabase-url';
import { quraRpc, xatoHolati } from '../_shared/yuk-tashish';

type Env = { SESSIYA_KALIT: string; SUPABASE_URL: string; SUPABASE_KEY: string; R2_CANONICAL?: R2Bucket };
const NO_STORE = { 'Cache-Control': 'no-store' };
const json = (b: unknown, status = 200) => Response.json(b, { status, headers: NO_STORE });

const oxirgiJoy = new Map<number, number>();
const JOY_ORALIQ_MS = 5_000;

async function rpcChaqir(env: Env, nom: string, body: unknown): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(supabaseBaseUrl(env.SUPABASE_URL) + '/rest/v1/rpc/' + nom, { method: 'POST', headers: { apikey: env.SUPABASE_KEY, Authorization: 'Bearer ' + env.SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return r.ok ? await r.json() as Record<string, unknown> : null;
  } catch { return null; }
}

/** Yetkazilgach iz R2 ga (gzip JSON) ko'chiriladi, Postgresda faqat masofa/davomiylik qoladi. Xato bo'lsa jim: keyingi iz_arxivla amali qayta uradi. */
export async function izniArxivla(env: Env, actorId: number, bronId: number): Promise<boolean> {
  if (!env.R2_CANONICAL) return false;
  const ol = await rpcChaqir(env, 't2_yb_p2_iz_ol_v1', { p_actor_id: actorId, p_bron_id: bronId });
  const iz = ol?.iz;
  if (!ol?.ok || !Array.isArray(iz) || iz.length === 0) return false;
  const gz = new Response(new Blob([JSON.stringify(iz)]).stream().pipeThrough(new CompressionStream('gzip')));
  const kalit = 'yb/iz/' + bronId + '.json.gz';
  await env.R2_CANONICAL.put(kalit, await gz.arrayBuffer(), { httpMetadata: { contentType: 'application/gzip' } });
  const a = await rpcChaqir(env, 't2_yb_p2_iz_arxivla_v1', { p_actor_id: actorId, p_bron_id: bronId, p_r2_kalit: kalit });
  return !!a?.ok;
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const sess = await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT);
  if (!sess) return json({ ok: false, code: 'AUTH_REQUIRED' }, 401);
  let so: Record<string, unknown> = {};
  try { so = await ctx.request.json(); } catch { return json({ ok: false, code: 'BODY_INVALID' }, 400); }
  const actorId = Number(sess.foydalanuvchi_id);
  if (!Number.isSafeInteger(actorId) || actorId <= 0) return json({ ok: false, code: 'AUTH_REQUIRED' }, 401);
  const q = quraRpc(so.amal, actorId, so);
  if (!q.ok) return json({ ok: false, code: q.code }, 400);
  if (so.amal === 'joy') {
    const hozir = Date.now();
    if (hozir - (oxirgiJoy.get(actorId) ?? 0) < JOY_ORALIQ_MS) return json({ ok: true, throttled: true });
    if (oxirgiJoy.size > 5000) oxirgiJoy.clear();
    oxirgiJoy.set(actorId, hozir);
  }
  try {
    const r = await fetch(supabaseBaseUrl(ctx.env.SUPABASE_URL) + '/rest/v1/rpc/' + q.rpc, {
      method: 'POST', headers: { apikey: ctx.env.SUPABASE_KEY, Authorization: 'Bearer ' + ctx.env.SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(q.body),
    });
    if (r.status === 404) return json({ ok: false, code: 'SERVER_YANGILANMAGAN' }, 503);
    if (!r.ok) {
      const e = await r.json().catch(() => null) as { code?: string } | null;
      const st = xatoHolati(e?.code);
      return json({ ok: false, code: st === 403 ? 'PERMISSION_DENIED' : st === 404 ? 'YB_TASHUVCHI_YOQ' : 'SERVER_XATO' }, st);
    }
    const j = await r.json() as Record<string, unknown> | null;
    if (!j || typeof j !== 'object') return json({ ok: false, code: 'SERVER_XATO' }, 500);
    const dat = (so.data ?? {}) as Record<string, unknown>;
    if ((so.amal === 'qadam' && dat.qadam === 'yetkazdi' && j.ok === true) || so.amal === 'iz_arxivla') {
      const bid = Number(dat.bron_id);
      if (Number.isSafeInteger(bid) && bid > 0) ctx.waitUntil(izniArxivla(ctx.env, actorId, bid));
    }
    return json({ ok: true, natija: j });
  } catch { return json({ ok: false, code: 'SERVER_XATO' }, 500); }
};
