/**
 * smeta-studio.ts — Smeta studiyasi qoralamasini server tomonda saqlash/o'qish (named commands only).
 *
 *   POST /api/smeta-studio  { amal: 'saqla', kompaniya_id, obyekt_id|null, draft_uid, expected_version, operation_id, hujjat }
 *   POST /api/smeta-studio  { amal: 'royxat', kompaniya_id }
 *   POST /api/smeta-studio  { amal: 'ol', kompaniya_id, draft_uid }
 *
 * Actor = session foydalanuvchi_id (never from the body). Company membership is checked here
 * against the session AND again inside the SECURITY DEFINER RPC. Draft only: t2_qator/F2 untouched.
 */
import { tekshir } from '../_shared/auth';
import { supabaseBaseUrl } from '../_shared/supabase-url';

type Env = { SUPABASE_URL: string; SUPABASE_KEY: string; SESSIYA_KALIT: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BYTES = 3_500_000;
const RPC = { saqla: 't2_smeta_studio_saqla_v1', royxat: 't2_smeta_studio_royxat_v1', ol: 't2_smeta_studio_ol_v1' } as const;

const fail = (code: string, status = 400) => Response.json({ ok: false, code }, { status });
const posInt = (v: unknown) => Number.isSafeInteger(v) && (v as number) > 0;

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const sess = await tekshir(ctx.request.headers.get('Cookie'), ctx.env.SESSIYA_KALIT);
  if (!sess || !posInt(sess.foydalanuvchi_id)) return fail('AUTH_REQUIRED', 401);
  if (sess.rol === 'rahbar') return fail('FORBIDDEN', 403);
  const raw = await ctx.request.text();
  if (raw.length > MAX_BYTES) return fail('DOCUMENT_TOO_LARGE', 413);
  let so: Record<string, unknown>;
  try { so = JSON.parse(raw); } catch { return fail('BODY_INVALID'); }
  const amal = so.amal as keyof typeof RPC;
  if (!Object.hasOwn(RPC, amal)) return fail('AMAL_INVALID');
  const kompaniyaId = Number(so.kompaniya_id);
  if (!posInt(kompaniyaId)) return fail('CONTEXT_REQUIRED');
  if (Array.isArray(sess.kompaniyalar) && !sess.kompaniyalar.some(a => a.kompaniya_id === kompaniyaId) && sess.rol !== 'superadmin') return fail('FORBIDDEN', 403);

  let args: Record<string, unknown>;
  if (amal === 'royxat') args = { p_actor_id: sess.foydalanuvchi_id, p_kompaniya_id: kompaniyaId };
  else {
    const draftUid = String(so.draft_uid ?? '');
    if (!UUID.test(draftUid)) return fail('DRAFT_UID_INVALID');
    if (amal === 'ol') args = { p_actor_id: sess.foydalanuvchi_id, p_kompaniya_id: kompaniyaId, p_draft_uid: draftUid };
    else {
      const operationId = String(so.operation_id ?? '');
      const expected = Number(so.expected_version);
      const obyektId = so.obyekt_id == null ? null : Number(so.obyekt_id);
      if (!UUID.test(operationId)) return fail('OPERATION_ID_REQUIRED');
      if (!Number.isSafeInteger(expected) || expected < 0) return fail('EXPECTED_VERSION_INVALID');
      if (obyektId != null && !posInt(obyektId)) return fail('OBJECT_INVALID');
      const doc = so.hujjat as Record<string, unknown> | null;
      if (!doc || typeof doc !== 'object' || doc.schema !== 'smeta-studio-v1' || doc.draftId !== draftUid) return fail('DOCUMENT_INVALID');
      args = { p_actor_id: sess.foydalanuvchi_id, p_kompaniya_id: kompaniyaId, p_obyekt_id: obyektId, p_draft_uid: draftUid,
        p_expected_version: expected, p_hujjat: doc, p_operation_id: operationId };
    }
  }
  const r = await fetch(supabaseBaseUrl(ctx.env.SUPABASE_URL) + '/rest/v1/rpc/' + RPC[amal], {
    method: 'POST',
    headers: { apikey: ctx.env.SUPABASE_KEY, Authorization: 'Bearer ' + ctx.env.SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const text = await r.text();
  let body: Record<string, unknown> | null = null;
  try { body = JSON.parse(text); } catch { /* raw */ }
  if (!r.ok) {
    // Membership exception from the RPC (42501) → 403; never leak raw Postgres text.
    const forbidden = /42501|a'zosi emas|a''zosi emas/.test(text);
    return fail(forbidden ? 'FORBIDDEN' : 'SAVE_FAILED', forbidden ? 403 : 502);
  }
  const status = body?.ok === false ? (body.code === 'VERSION_CONFLICT' ? 409 : 400) : 200;
  return Response.json(body ?? { ok: false, code: 'SAVE_FAILED' }, { status });
};
