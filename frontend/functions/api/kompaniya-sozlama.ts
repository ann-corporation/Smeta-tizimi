/**
 * /api/kompaniya-sozlama — kompaniya darajasidagi sozlamalar BITTA server joyida (Sozlamalar markazi, 2026-10-26).
 *
 * GET  ?kompaniya_id=N → { ok, kompaniya_id, mavqe, f2_tasdiq_rejimi, sozlamalar: { [kalit]: { qiymat, yangilangan_at } }, yozish_mumkin }
 * POST { kompaniya_id, kalit, qiymat, operation_id }
 *      kalit: 'hujjat.imzo_tomonlari' | 'hujjat.dizayn' (qiymat — obyekt yoki null = o'chirish)
 *           | 'f2.tasdiq_rejimi' (qiymat — 'shaxsiy' | 'korporativ')
 *
 * Actor FAQAT sessiyadan. Ruxsat bazada: o'qish — company.read, yozish — company.profile.update
 * (t2_effective_authorization_v1 — kompaniya profili bilan bir xil yagona haqiqat). Migratsiya: 20261111400000.
 */
import { cachedAuthority } from '../_shared/permission-policy';
import { tekshir } from '../_shared/auth';
import { supabaseBaseUrl } from '../_shared/supabase-url';

type Env = { SUPABASE_URL?: string; SUPABASE_KEY?: string; SESSIYA_KALIT: string };
type Rpc = { ok?: boolean; code?: string; [k: string]: unknown };

export const KALITLAR = ['hujjat.imzo_tomonlari', 'hujjat.dizayn', 'f2.tasdiq_rejimi'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const json = (b: unknown, status = 200) => Response.json(b, { status, headers: { 'Cache-Control': 'no-store' } });

function status(code: string): number {
  if (code === 'AUTHORIZATION_DENIED') return 403;
  if (code === 'COMPANY_NOT_FOUND') return 404;
  if (code === 'SERVER_YANGILANMAGAN') return 404;
  if (code === 'ACTOR_NOT_FOUND') return 401;
  if (/INVALID|REQUIRED/.test(code)) return 400;
  return 500;
}

async function rpc(env: Env, nom: string, yuk: unknown): Promise<Rpc | null> {
  try {
    const r = await fetch(supabaseBaseUrl(env.SUPABASE_URL!) + '/rest/v1/rpc/' + nom, {
      method: 'POST', headers: { apikey: env.SUPABASE_KEY!, Authorization: 'Bearer ' + env.SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(yuk),
    });
    if (r.status === 404) return { ok: false, code: 'SERVER_YANGILANMAGAN' };
    if (!r.ok) { console.error('[kompaniya-sozlama]', nom, 'HTTP', r.status); return null; }
    const j = await r.json() as Rpc;
    return j && typeof j === 'object' ? j : null;
  } catch { console.error('[kompaniya-sozlama]', nom, 'transport'); return null; }
}

async function aktor(ctx: { request: Request; env: Env; data: unknown }): Promise<number | Response> {
  const sess = cachedAuthority(ctx as never) ?? await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT);
  const id = (sess as { foydalanuvchi_id?: number } | null)?.foydalanuvchi_id;
  if (!sess || id == null) return json({ ok: false, code: 'AUTH_REQUIRED' }, 401);
  if (!ctx.env.SUPABASE_URL || !ctx.env.SUPABASE_KEY) return json({ ok: false, code: 'CONFIG' }, 503);
  return id;
}

const javob = (j: Rpc | null) => {
  if (!j) return json({ ok: false, code: 'SERVER_XATO' }, 500);
  if (j.ok !== true) { const code = typeof j.code === 'string' ? j.code : 'SERVER_XATO'; return json({ ok: false, code }, status(code)); }
  return json(j);
};

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const a = await aktor(ctx);
  if (a instanceof Response) return a;
  const kid = Number(new URL(ctx.request.url).searchParams.get('kompaniya_id'));
  if (!Number.isSafeInteger(kid) || kid <= 0) return json({ ok: false, code: 'REQUEST_INVALID' }, 400);
  return javob(await rpc(ctx.env, 't2_kompaniya_sozlama_ol_v1', { p_actor_id: a, p_kompaniya_id: kid }));
};

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const origin = ctx.request.headers.get('Origin');
  if (ctx.request.headers.get('Sec-Fetch-Site') === 'cross-site' || (origin && origin !== new URL(ctx.request.url).origin)) {
    return json({ ok: false, code: 'ORIGIN_INVALID' }, 403);
  }
  const a = await aktor(ctx);
  if (a instanceof Response) return a;
  const b = await ctx.request.json().catch(() => null) as { kompaniya_id?: unknown; kalit?: unknown; qiymat?: unknown; operation_id?: unknown } | null;
  const kid = Number(b?.kompaniya_id);
  const kalit = String(b?.kalit ?? '');
  if (!b || !Number.isSafeInteger(kid) || kid <= 0 || !(KALITLAR as readonly string[]).includes(kalit)) return json({ ok: false, code: 'REQUEST_INVALID' }, 400);
  const q = b.qiymat;
  if (kalit === 'f2.tasdiq_rejimi' ? (q !== 'shaxsiy' && q !== 'korporativ') : (q !== null && (typeof q !== 'object' || Array.isArray(q)))) {
    return json({ ok: false, code: 'QIYMAT_INVALID' }, 400);
  }
  if (q !== null && JSON.stringify(q).length > 20000) return json({ ok: false, code: 'QIYMAT_INVALID' }, 400);
  const op = typeof b.operation_id === 'string' && UUID.test(b.operation_id) ? b.operation_id : crypto.randomUUID();
  return javob(await rpc(ctx.env, 't2_kompaniya_sozlama_saqla_v1', { p_actor_id: a, p_kompaniya_id: kid, p_kalit: kalit, p_qiymat: q, p_operation_id: op }));
};
