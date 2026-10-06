/**
 * AI chaqiruvlarining YAGONA hisobli o'rami: (1) limit va hamyon tekshiruvi — limit yo'q/tugagan/token yo'q bo'lsa model CHAQIRILMAYDI;
 * (2) chaqiruv; (3) haqiqiy sarf jurnalga va kompaniya hamyonidan (ustama bilan) yechiladi. Agentga tegishli HAR QANDAY model chaqiruvi
 * (jumladan smeta-AI) shu orqali o'tishi shart — shunda xarajat, foyda va limit nazorat ostida bo'ladi.
 */
import { aiCall as aiXom, aiPublicError, type AiEnv, type AiRequest, type AiResponse } from './ai';
import { rpcData, type AgentRpcEnv, type RpcNatija } from './agent-rpc';

const JAVOB = { headers: { 'Cache-Control': 'no-store' } };

export class ByudjetXatosi extends Error { constructor(readonly kod: string, readonly xabar: string) { super(kod); } }
const BYUDJET_XABAR: Record<string, string> = {
  BYUDJET_YOQ: 'AI uchun oylik limit belgilanmagan — avval Boshqaruv → AI markazi → Xarajat bo‘limida limit qo‘ying',
  BYUDJET_TUGADI: 'AI oylik limiti tugadi — limitni oshiring yoki keyingi oyni kuting',
  TOKEN_YETMAYDI: 'Tokenlar yetarli emas — hisobni to‘ldiring',
  KOMPANIYA_AI_OCHIQ: 'Kompaniya admini AI ni o‘chirgan (Sozlamalar → AI)',
  TOKEN_LIMIT_TUGADI: 'Kompaniyaning AI oylik token limiti tugadi — admin limitni oshirishi mumkin',
};

/** BARCHA model chaqiruvlari shu orqali: (1) limit tekshiruvi — limit yo'q/tugagan bo'lsa model CHAQIRILMAYDI; (2) chaqiruv; (3) haqiqiy sarf jurnalga. */
export async function aiHisobli(env: AiEnv & AgentRpcEnv, actor: number, kid: number | null, profil: string | null, amal: string, req: AiRequest): Promise<AiResponse> {
  const t = await rpcData(env, 't2_agent_sarf_tekshir_v1', { p_actor_id: actor, p_kompaniya_id: kid });
  if (!t.ok) { const c = String(t.data.code ?? ''); throw new ByudjetXatosi(c, BYUDJET_XABAR[c] ?? 'AI hozir mavjud emas'); }
  try {
    const r = await aiXom(env, req);
    await rpcData(env, 't2_agent_sarf_yoz_v1', { p_actor_id: actor, p_kompaniya_id: kid, p_profil: profil, p_amal: amal, p_model: r.model, p_kirish: r.usage?.inputTokens ?? 0, p_chiqish: r.usage?.outputTokens ?? 0, p_narx_usd: r.usage?.cost ?? null, p_muvaffaqiyat: true });
    return r;
  } catch (e) {
    await rpcData(env, 't2_agent_sarf_yoz_v1', { p_actor_id: actor, p_kompaniya_id: kid, p_profil: profil, p_amal: amal, p_model: req.model ?? null, p_kirish: 0, p_chiqish: 0, p_narx_usd: 0, p_muvaffaqiyat: false }).catch(() => null);
    throw e;
  }
}
/** Model xatosi/limit xatosini foydalanuvchiga tushunarli ma'lumotga aylantiradi (status + tana). */
export function aiXatoMalumoti(e: unknown): { status: number; body: Record<string, unknown> } {
  if (e instanceof ByudjetXatosi) return { status: 402, body: { ok: false, code: e.kod, error: e.xabar } };
  const p = aiPublicError(e);
  return { status: p.code === 'not_configured' ? 503 : 502, body: { ok: false, code: p.code, error: p.message } };
}
export function aiXatoJavobi(e: unknown): Response {
  const m = aiXatoMalumoti(e);
  return Response.json(m.body, { status: m.status, ...JAVOB });
}

/** Admin tanlagan (katalogdagi) model; yo'q bo'lsa server standarti (tier). */
export const modelOf = (m: RpcNatija): string | undefined => (typeof m.data.model === 'string' && m.data.model ? m.data.model : undefined);
