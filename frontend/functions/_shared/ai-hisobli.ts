/**
 * Metered AI call for product features (smeta AI, pricing agent). Same budget/accounting contract as the
 * agent workspace (agent platform RPCs, Claude/agent lane): check the company's AI budget BEFORE the model
 * is called (no budget → no call), then record actual usage. Fail-closed on any accounting error.
 */
import { supabaseBaseUrl } from './supabase-url';
import { aiCall, type AiEnv, type AiRequest, type AiResponse } from './ai';

export type HisobEnv = AiEnv & { SUPABASE_URL?: string; SUPABASE_KEY?: string };
export class AiByudjetXatosi extends Error { constructor(readonly kod: string, readonly xabar: string) { super(kod); } }
const XABAR: Record<string, string> = {
  BYUDJET_YOQ: 'AI uchun oylik limit belgilanmagan — Boshqaruv → AI markazi → Xarajat bo‘limida limit qo‘ying',
  BYUDJET_TUGADI: 'AI oylik limiti tugadi — limitni oshiring yoki keyingi oyni kuting',
  TOKEN_YETMAYDI: 'Tokenlar yetarli emas — hisobni to‘ldiring',
  KOMPANIYA_AI_OCHIQ: 'Kompaniya admini AI ni o‘chirgan (Sozlamalar → AI)',
  TOKEN_LIMIT_TUGADI: 'Kompaniyaning AI oylik token limiti tugadi',
};

async function rpc(env: HisobEnv, nom: string, yuk: Record<string, unknown>): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return { ok: false, data: { code: 'SERVER_SOZLANMAGAN' } };
  const r = await fetch(supabaseBaseUrl(env.SUPABASE_URL) + '/rest/v1/rpc/' + nom, {
    method: 'POST', headers: { apikey: env.SUPABASE_KEY, Authorization: 'Bearer ' + env.SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(yuk),
  }).catch(() => null);
  if (!r || !r.ok) return { ok: false, data: { code: r?.status === 403 ? 'COMPANY_ACCESS_DENIED' : 'HISOB_XATOSI' } };
  const d = await r.json().catch(() => null) as Record<string, unknown> | null;
  return { ok: !!d && d.ok !== false, data: d ?? {} };
}

export async function aiHisobli(env: HisobEnv, actor: number, kompaniyaId: number, profil: string, amal: string, req: AiRequest): Promise<AiResponse> {
  const t = await rpc(env, 't2_agent_sarf_tekshir_v1', { p_actor_id: actor, p_kompaniya_id: kompaniyaId });
  if (!t.ok) { const c = String(t.data.code ?? 'HISOB_XATOSI'); throw new AiByudjetXatosi(c, XABAR[c] ?? 'AI hozir mavjud emas (hisob tekshiruvi o‘tmadi)'); }
  // The model the admin chose for this profile in the AI centre (company override, else global); else server tier default.
  const m = req.model ? null : await rpc(env, 't2_agent_muhit_v1', { p_actor_id: actor, p_kompaniya_id: kompaniyaId, p_profil: profil });
  const model = req.model ?? (m && typeof m.data.model === 'string' && m.data.model ? m.data.model : undefined);
  try {
    const r = await aiCall(env, { ...req, model });
    await rpc(env, 't2_agent_sarf_yoz_v1', { p_actor_id: actor, p_kompaniya_id: kompaniyaId, p_profil: profil, p_amal: amal, p_model: r.model,
      p_kirish: r.usage?.inputTokens ?? 0, p_chiqish: r.usage?.outputTokens ?? 0, p_narx_usd: (r.usage as { cost?: number } | undefined)?.cost ?? null, p_muvaffaqiyat: true });
    return r;
  } catch (e) {
    await rpc(env, 't2_agent_sarf_yoz_v1', { p_actor_id: actor, p_kompaniya_id: kompaniyaId, p_profil: profil, p_amal: amal, p_model: null,
      p_kirish: 0, p_chiqish: 0, p_narx_usd: 0, p_muvaffaqiyat: false }).catch(() => null);
    throw e;
  }
}
