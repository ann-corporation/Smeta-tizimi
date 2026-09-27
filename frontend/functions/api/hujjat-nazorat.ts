/**
 * hujjat-nazorat.ts — SMETA/F2/NAKOPITELNIY document-control gateway.
 * session -> actor -> Supabase canonical RPCs. No Drive/Sheets/GAS.
 *
 *   GET  /api/hujjat-nazorat?amal=workbench&obyekt_id=<n>[&davr=YYYY-MM-01][&limit=<n>]
 *   GET  /api/hujjat-nazorat?amal=nakopitelniy&obyekt_id=<n>[&davr=][&limit=][&offset=][&faqat_faol=0|1]
 *        (t2_nakopitelniy_v2: sahifa ≤ 5000, javobda keyingi_offset — mijoz
 *         null bo'lguncha o'qiydi; egasi qarori Q4, 2026-09-25)
 *   GET  /api/hujjat-nazorat?amal=closeout&obyekt_id=<n>
 *   GET  /api/hujjat-nazorat?amal=ozgarish-royxat&obyekt_id=<n>[&limit=<n>]
 *   GET  /api/hujjat-nazorat?amal=forma3-royxat&obyekt_id=<n>[&loyiha_id=<n>]
 *   POST /api/hujjat-nazorat   { amal: 'ozgarish-yarat'|'ozgarish-tasdiqlash'|'ozgarish-qaytar'
 *                                     |'forma3-yarat'|'forma3-qoida', ... }
 *
 * Every RPC is membership-checked server-side (t2_actor_kompaniya_azo_tekshir);
 * this gateway only resolves the actor from the session and forwards.
 */
import { tekshir } from '../_shared/auth';
import { supabaseBaseUrl } from '../_shared/supabase-url';
import { xavfsizUpstream, xavfsizXato } from '../_shared/xato';

type Env = { SUPABASE_URL: string; SUPABASE_KEY: string; SESSIYA_KALIT: string };

const num = (v: string | null) => (v == null || v === '' ? null : Number(v));

async function rpc(env: Env, name: string, body: Record<string, unknown>) {
  const r = await fetch(supabaseBaseUrl(env.SUPABASE_URL) + '/rest/v1/rpc/' + name, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_KEY, Authorization: 'Bearer ' + env.SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let j: any = null;
  try { j = JSON.parse(text); } catch { /* keep raw */ }
  return { httpOk: r.ok, status: r.status, j, text };
}

function reply(_name: string, res: { httpOk: boolean; status: number; j: any; text: string }, failCode: string) {
  const { httpOk, status: upstreamStatus, j, text } = res;
  if (!httpOk || !j || j.ok !== true) {
    const code = (j && j.code) || failCode;
    const status = /42501|a'zo|azo|membership|DENIED/i.test(code + text) ? 403
      : /does not exist|PGRST202|not applied/i.test(text) ? 501
      : 502;
    const safe = xavfsizUpstream(upstreamStatus, j || text, status);
    return safe;
  }
  return Response.json(j);
}

async function actorFrom(ctx: Parameters<PagesFunction<Env>>[0]) {
  if (!ctx.env.SUPABASE_URL || !ctx.env.SUPABASE_KEY || !ctx.env.SESSIYA_KALIT) {
    return { err: Response.json({ ok: false, code: 'CONFIG' }, { status: 500 }) };
  }
  const sess = await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT);
  const actorId = sess && (sess as any).foydalanuvchi_id;
  if (actorId == null) return { err: Response.json({ ok: false, code: 'AUTH_REQUIRED' }, { status: 401 }) };
  return { actorId: Number(actorId) };
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  try {
    const a = await actorFrom(ctx);
    if (a.err) return a.err;
    const actorId = a.actorId!;
    const u = new URL(ctx.request.url);
    const amal = u.searchParams.get('amal') || 'workbench';
    const obyektId = num(u.searchParams.get('obyekt_id'));
    const loyihaId = num(u.searchParams.get('loyiha_id'));
    const davr = u.searchParams.get('davr') || null;
    const limit = num(u.searchParams.get('limit'));

    if (amal === 'forma3-royxat') {
      if (obyektId == null && loyihaId == null) return Response.json({ ok: false, code: 'SCOPE_REQUIRED' }, { status: 400 });
      return reply('t2_forma3_royxat_v1', await rpc(ctx.env, 't2_forma3_royxat_v1',
        { p_loyiha_id: loyihaId, p_obyekt_id: obyektId, p_actor_id: actorId }), 'FORMA3_LIST_FAILED');
    }
    if (obyektId == null) return Response.json({ ok: false, code: 'OBYEKT_REQUIRED' }, { status: 400 });

    switch (amal) {
      case 'workbench':
        // Exact F2 source amounts must survive the boundary. The additive
        // wrapper keeps old deployments readable while the new migration is
        // applied; it never derives certified_amount from quantity*price.
        return reply('t2_workbench_exact_v1', await rpc(ctx.env, 't2_workbench_exact_v1',
          { p_obyekt_id: obyektId, p_actor_id: actorId, p_davr: davr, p_limit: limit ?? 800 }), 'WORKBENCH_FAILED');
      case 'nakopitelniy':
        return reply('t2_nakopitelniy_v2', await rpc(ctx.env, 't2_nakopitelniy_v2',
          { p_obyekt_id: obyektId, p_actor_id: actorId, p_davr: davr, p_limit: limit ?? 500,
            p_faqat_faol: u.searchParams.get('faqat_faol') !== '0',
            p_offset: num(u.searchParams.get('offset')) ?? 0 }), 'NAKOPITELNIY_FAILED');
      case 'closeout':
        return reply('t2_obyekt_yakunlash_v1', await rpc(ctx.env, 't2_obyekt_yakunlash_v1',
          { p_obyekt_id: obyektId, p_actor_id: actorId }), 'CLOSEOUT_FAILED');
      case 'ozgarish-royxat':
        return reply('t2_smeta_ozgarish_royxat_v1', await rpc(ctx.env, 't2_smeta_ozgarish_royxat_v1',
          { p_obyekt_id: obyektId, p_actor_id: actorId, p_limit: limit ?? 200 }), 'OZGARISH_LIST_FAILED');
      default:
        return Response.json({ ok: false, code: 'AMAL_INVALID', amal }, { status: 400 });
    }
  } catch (err: any) {
    return xavfsizXato('HUJJAT_NAZORAT_FAILED', 500, err?.message || String(err));
  }
};

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  try {
    const a = await actorFrom(ctx);
    if (a.err) return a.err;
    const actorId = a.actorId!;
    const b = (await ctx.request.json().catch(() => ({}))) as Record<string, any>;
    const amal = String(b.amal || '');
    const opId = b.operation_id || crypto.randomUUID();

    switch (amal) {
      case 'ozgarish-yarat':
        if (!b.obyekt_id || !b.tur || !Array.isArray(b.qatorlar)) return Response.json({ ok: false, code: 'PARAMS' }, { status: 400 });
        return reply('t2_smeta_ozgarish_yarat_v1', await rpc(ctx.env, 't2_smeta_ozgarish_yarat_v1', {
          p_obyekt_id: Number(b.obyekt_id), p_actor_id: actorId, p_tur: b.tur, p_sabab: b.sabab ?? null,
          p_qatorlar: b.qatorlar, p_raqam: b.raqam ?? null, p_operation_id: opId,
          p_effective_oy: b.effective_oy ?? null, p_kind: b.kind ?? null,
          p_evidence_hujjat_id: b.evidence_hujjat_id ?? null, p_evidence_izoh: b.evidence_izoh ?? null,
        }), 'OZGARISH_YARAT_FAILED');
      case 'ozgarish-tasdiqlash':
        if (!b.ozgarish_id) return Response.json({ ok: false, code: 'PARAMS' }, { status: 400 });
        // v2 = v1 + signal yangilash oxirida bir marta (30 s chegarasi; 20261101091000).
        return reply('t2_smeta_ozgarish_tasdiqlash_v2', await rpc(ctx.env, 't2_smeta_ozgarish_tasdiqlash_v2', {
          p_ozgarish_id: Number(b.ozgarish_id), p_actor_id: actorId,
          p_kutilgan_versiya: b.kutilgan_versiya ?? null, p_operation_id: opId,
        }), 'OZGARISH_TASDIQLASH_FAILED');
      case 'ozgarish-qaytar':
        if (!b.ozgarish_id) return Response.json({ ok: false, code: 'PARAMS' }, { status: 400 });
        return reply('t2_smeta_ozgarish_qaytar_v1', await rpc(ctx.env, 't2_smeta_ozgarish_qaytar_v1', {
          p_ozgarish_id: Number(b.ozgarish_id), p_actor_id: actorId, p_sabab: b.sabab ?? null, p_operation_id: opId,
        }), 'OZGARISH_QAYTAR_FAILED');
      case 'forma3-yarat':
        if (!b.obyekt_id || !Array.isArray(b.akt_ids) || !b.davr_boshi || !b.davr_oxiri)
          return Response.json({ ok: false, code: 'PARAMS' }, { status: 400 });
        return reply('t2_forma3_yarat_v1', await rpc(ctx.env, 't2_forma3_yarat_v1', {
          p_actor_id: actorId, p_loyiha_id: b.loyiha_id ?? null, p_obyekt_id: Number(b.obyekt_id),
          p_shartnoma_id: b.shartnoma_id ?? null, p_davr_boshi: b.davr_boshi, p_davr_oxiri: b.davr_oxiri,
          p_akt_ids: b.akt_ids.map(Number), p_raqam: b.raqam ?? null, p_operation_id: opId,
        }), 'FORMA3_YARAT_FAILED');
      case 'forma3-qoida':
        if (!b.forma3_id || !b.qoida_manba) return Response.json({ ok: false, code: 'PARAMS' }, { status: 400 });
        return reply('t2_forma3_qoida_belgila_v1', await rpc(ctx.env, 't2_forma3_qoida_belgila_v1', {
          p_forma3_id: Number(b.forma3_id), p_actor_id: actorId, p_qoida_manba: String(b.qoida_manba), p_operation_id: opId,
        }), 'FORMA3_QOIDA_FAILED');
      default:
        return Response.json({ ok: false, code: 'AMAL_INVALID', amal }, { status: 400 });
    }
  } catch (err: any) {
    return xavfsizXato('HUJJAT_NAZORAT_FAILED', 500, err?.message || String(err));
  }
};
