/**
 * /api/transport — «transport turi» (foiz | tkm | narx_ichida) ning UI server nuqtasi: smeta ekranidagi Transport paneli.
 * Hammasi POST JSON; `kompaniya_id` majburiy; aktor — sessiyadan (tanadagi actor_id rad etiladi).
 *   audit   — {obyekt_id}                                           -> t2_qator_transport_audit_v1 (faqat o'qish; smeta.read)
 *   yoy     — {obyekt_id, rz_id, tkm_narx, qatorlar[], majburiy?, yoz?} -> t2_qator_transport_yoy_v1; yoz:false (sukut) = PREVIEW (hech narsa yozilmaydi),
 *             yoz:true = yozish (smeta.write). Bloklangan guruh bo'lsa `majburiy:true` kerak (foydalanuvchining aniq «farqni qabul qilaman» belgisi).
 *   belgila — {obyekt_id, qator_idlar[], usul}                      -> t2_qator_transport_belgila_v1 (smeta.write)
 * Yozuv ruxsati boshqa smeta tahrirlari bilan bir xil (`smeta.write`); RPC lar a'zolik va ruxsatni o'zlari ham tekshiradi (SECURITY DEFINER).
 * Servis kaliti FAQAT tarmoq darvozasi; aktor har RPC ga sessiyadan MAJBURAN qo'yiladi. Kirish tekshiruvi — src/lib/transport-yoy/kirish.ts (Jarvis bilan bir manba).
 */
import { tekshir, type Sess } from '../_shared/auth';
import { cachedAuthority, yopiqModul } from '../_shared/permission-policy';
import { roleAuthority, sessiyaYaroqsizmi, yaroqsizSessiyaJavob } from '../_shared/role-authority';
import { supabaseBaseUrl } from '../_shared/supabase-url';
import { auditRpcYuki, belgilaKirish, belgilaRpcYuki, kirishXatomi, yoyKirish, yoyRpcYuki } from '../../src/lib/transport-yoy/kirish';

type Env = { SUPABASE_URL: string; SUPABASE_KEY: string; SESSIYA_KALIT: string };
type Context = Parameters<PagesFunction<Env>>[0];
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const fail = (code: string, status: number, extra: Record<string, unknown> = {}) => json({ ok: false, code, ...extra }, status);
const butun = (v: unknown): number | null => { const n = Number(v); return Number.isSafeInteger(n) && n > 0 ? n : null; };

async function aktor(ctx: Context): Promise<Sess | Response> {
  const cached = cachedAuthority(ctx);
  if (cached) return cached;
  if (!ctx.env.SESSIYA_KALIT) return fail('CONFIG_UNAVAILABLE', 503);
  let signed: Sess | null;
  try { signed = await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT); } catch { return fail('AUTHORITY_UNAVAILABLE', 503); }
  if (!signed) return fail('AUTH_REQUIRED', 401);
  if (!ctx.env.SUPABASE_URL || !ctx.env.SUPABASE_KEY) return fail('AUTHORITY_UNAVAILABLE', 503);
  const current = await roleAuthority(signed, ctx.env);
  if (!current && sessiyaYaroqsizmi(signed)) return yaroqsizSessiyaJavob();
  return current ?? fail('AUTHORITY_UNAVAILABLE', 503);
}

/** A'zolik + capability (aniq rad etilgani ustun) + yopiq modul. */
function ruxsat(s: Sess, kid: number, perm: string): Response | null {
  if (!s.foydalanuvchi_id || !s.permissionsByCompany) return fail('AUTHORITY_UNAVAILABLE', 503);
  if (!s.kompaniyalar?.some((c) => c.kompaniya_id === kid)) return fail('PERMISSION_DENIED', 403);
  const bor = s.permissionsByCompany[kid] ?? []; const rad = s.explicitDenialsByCompany?.[kid] ?? [];
  if (!bor.includes(perm) || rad.includes(perm)) return fail('PERMISSION_DENIED', 403, { kerak: perm });
  if (yopiqModul(perm, [kid], s.modullarOffByCompany)) return fail('MODULE_DISABLED', 403);
  return null;
}

async function rpc<T = Record<string, unknown>>(env: Env, nom: string, yuk: Record<string, unknown>): Promise<{ status: number; data: T | null }> {
  const r = await fetch(supabaseBaseUrl(env.SUPABASE_URL) + '/rest/v1/rpc/' + nom, {
    method: 'POST', headers: { apikey: env.SUPABASE_KEY, Authorization: 'Bearer ' + env.SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(yuk),
  }).catch(() => null);
  if (!r) return { status: 503, data: null };
  return { status: r.status, data: await r.json().catch(() => null) as T | null };
}

/** Obyekt shu kompaniyaniki ekanini tekshiradi (tenant chegarasi). Begona/yo'q obyekt — bir xil 404. */
async function obyektBormi(env: Env, kid: number, obyektId: number): Promise<boolean> {
  const r = await fetch(`${supabaseBaseUrl(env.SUPABASE_URL)}/rest/v1/t2_obyekt?id=eq.${obyektId}&kompaniya_id=eq.${kid}&select=id&limit=1`,
    { headers: { apikey: env.SUPABASE_KEY, Authorization: 'Bearer ' + env.SUPABASE_KEY } }).catch(() => null);
  if (!r || !r.ok) return false;
  const q = await r.json().catch(() => null) as unknown[] | null;
  return Array.isArray(q) && q.length > 0;
}

/** RPC javobini mijoz javobiga: 42501 / 403 — ruxsat; ok:false — RPC ning o'z kodi (400/409); server xatosi — 502. */
function rpcJavob(r: { status: number; data: Record<string, unknown> | null }): Response {
  const kod = String((r.data as { code?: string } | null)?.code ?? '');
  if (r.status === 403 || kod === '42501') return fail('PERMISSION_DENIED', 403);
  if (r.status === 404 || kod === 'PGRST202' || kod === '42883') return fail('TRANSPORT_RPC_YOQ', 501, { xabar: 'Transport funksiyasi bazada hali yoqilmagan' });
  if (!r.data || r.status >= 500) return fail('SERVER_XATO', 502);
  if (r.status >= 400) return fail(kod || 'RPC_XATO', 400, { xabar: String((r.data as { message?: string }).message ?? 'Server rad etdi') });
  /* TASDIQ_KERAK — xato emas: preview jadvali + bloklangan belgisi qaytadi (UI aniq tasdiq so'raydi). */
  if (r.data.ok === false && r.data.code !== 'TASDIQ_KERAK') return json({ ok: false, code: String(r.data.code ?? 'RPC_XATO'), xabar: String(r.data.error ?? 'Server rad etdi'), ...(Array.isArray(r.data.qator_idlar) ? { qator_idlar: r.data.qator_idlar } : {}) }, 409);
  return json(r.data);
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const origin = ctx.request.headers.get('Origin');
  if (ctx.request.headers.get('Sec-Fetch-Site') === 'cross-site' || (origin && origin !== new URL(ctx.request.url).origin)) return fail('ORIGIN_INVALID', 403);
  const s = await aktor(ctx); if (s instanceof Response) return s;
  let b: Record<string, unknown>;
  try { const j = await ctx.request.json(); if (!j || typeof j !== 'object' || Array.isArray(j)) return fail('BODY_INVALID', 400); b = j as Record<string, unknown>; } catch { return fail('BODY_INVALID', 400); }
  const kid = butun(b.kompaniya_id);
  if (!kid) return fail('COMPANY_REQUIRED', 400);
  for (const k of Object.keys(b)) if (/^(actor_?id|p_actor_id|aktor|kim)$/i.test(k)) return fail('ARGUMENT_TAQIQLANGAN', 400, { xabar: `«${k}» yuborilmaydi: aktor sessiyadan olinadi` });
  const aid = s.foydalanuvchi_id as number;
  const amal = b.amal;

  if (amal === 'audit') {
    const rad = ruxsat(s, kid, 'smeta.read'); if (rad) return rad;
    const obyekt = butun(b.obyekt_id); if (!obyekt) return fail('OBYEKT_KERAK', 400);
    if (!(await obyektBormi(ctx.env, kid, obyekt))) return fail('TOPILMADI', 404);
    return rpcJavob(await rpc(ctx.env, 't2_qator_transport_audit_v1', auditRpcYuki(obyekt, aid)));
  }
  if (amal === 'yoy') {
    const rad = ruxsat(s, kid, 'smeta.write'); if (rad) return rad;
    const k = yoyKirish(b);
    if (kirishXatomi(k)) return fail(k.xato, 400, k.tafsilot ? { xabar: k.tafsilot } : {});
    if (!(await obyektBormi(ctx.env, kid, k.obyekt_id))) return fail('TOPILMADI', 404);
    return rpcJavob(await rpc(ctx.env, 't2_qator_transport_yoy_v1', yoyRpcYuki(k, aid)));
  }
  if (amal === 'belgila') {
    const rad = ruxsat(s, kid, 'smeta.write'); if (rad) return rad;
    const k = belgilaKirish(b);
    if (kirishXatomi(k)) return fail(k.xato, 400, k.tafsilot ? { xabar: k.tafsilot } : {});
    if (!(await obyektBormi(ctx.env, kid, k.obyekt_id))) return fail('TOPILMADI', 404);
    return rpcJavob(await rpc(ctx.env, 't2_qator_transport_belgila_v1', belgilaRpcYuki(k, aid)));
  }
  return fail('AMAL_NOMALUM', 400);
};
