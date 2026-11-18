/**
 * Metered AI call for product features (smeta AI, pricing agent). Same budget/accounting contract as the
 * agent workspace (agent platform RPCs, Claude/agent lane): check the company's AI budget BEFORE the model
 * is called (no budget → no call), then record actual usage. Fail-closed on any accounting error.
 */
import { supabaseBaseUrl } from './supabase-url';
import { aiCall, type AiEnv, type AiRequest, type AiResponse } from './ai';
import { studioModelRequest, type StudioRoutingEnv } from './smeta-ai-routing';
import { telemetriyaYoz, xatoKodi, yuzaAniqla } from './ai-telemetriya';

export type HisobEnv = AiEnv & StudioRoutingEnv & { SUPABASE_URL?: string; SUPABASE_KEY?: string };
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
  if (!t.ok) { const c = String(t.data.code ?? 'HISOB_XATOSI'); await telemetriyaYoz(env, { actor, kompaniyaId, yuza: yuzaAniqla(amal, profil), ok: false, xatoKod: c, niyat: amal }); throw new AiByudjetXatosi(c, XABAR[c] ?? 'AI hozir mavjud emas (hisob tekshiruvi o‘tmadi)'); }
  // The model the admin chose for this profile in the AI centre (company override, else global); else server tier default.
  const m = req.model ? null : await rpc(env, 't2_agent_muhit_v1', { p_actor_id: actor, p_kompaniya_id: kompaniyaId, p_profil: profil });
  const model = req.model ?? (m && typeof m.data.model === 'string' && m.data.model ? m.data.model : undefined);
  const t0 = Date.now();
  const yuza = yuzaAniqla(amal, profil);
  try {
    const r = await aiCall(env, studioModelRequest(env, profil, amal, req, model));
    const kechikishMs = Date.now() - t0;
    // Provider-generation attribution without prompts, keys, files or user text.
    // Reasoning is INCLUDED in output tokens; never add it a second time to billing.
    console.info('AI_USAGE', JSON.stringify({ generation_id: r.generationId ?? null, actor_id: actor, company_id: kompaniyaId,
      profil, amal, workload: req.workload ?? 'primary', model: r.model, provider: r.provider,
      input_tokens: r.usage?.inputTokens ?? null, output_tokens: r.usage?.outputTokens ?? null,
      reasoning_tokens: r.usage?.reasoningTokens ?? null, cost_usd: r.usage?.cost ?? null, finish_reason: r.finishReason ?? null }));
    /* Sarf yozuvi va telemetriya parallel (qo'shimcha kutish yo'q); telemetriya hech qachon throw qilmaydi. */
    await Promise.all([
      rpc(env, 't2_agent_sarf_yoz_v1', { p_actor_id: actor, p_kompaniya_id: kompaniyaId, p_profil: profil, p_amal: amal, p_model: r.model,
        p_kirish: r.usage?.inputTokens ?? 0, p_chiqish: r.usage?.outputTokens ?? 0, p_narx_usd: (r.usage as { cost?: number } | undefined)?.cost ?? null, p_muvaffaqiyat: true }),
      telemetriyaYoz(env, { actor, kompaniyaId, yuza, model: r.model, kechikishMs, ok: true, niyat: amal, kirish: r.usage?.inputTokens, chiqish: r.usage?.outputTokens, manba: 'model' }),
    ]);
    return r;
  } catch (e) {
    await Promise.all([
      rpc(env, 't2_agent_sarf_yoz_v1', { p_actor_id: actor, p_kompaniya_id: kompaniyaId, p_profil: profil, p_amal: amal, p_model: null,
        p_kirish: 0, p_chiqish: 0, p_narx_usd: 0, p_muvaffaqiyat: false }).catch(() => null),
      telemetriyaYoz(env, { actor, kompaniyaId, yuza, model: model ?? null, kechikishMs: Date.now() - t0, ok: false, xatoKod: xatoKodi(e), niyat: amal, manba: 'model' }),
    ]);
    throw e;
  }
}
