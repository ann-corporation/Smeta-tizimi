/** Jarvis/smeta AI umumiy xotirasi: t2_agent_xotira (3 daraja) — t2_smeta_xotira_v1; RPC yo'q bo'lsa kompaniya xotirasi agent muhitidan. */
import { rpcData, type AgentRpcEnv } from './agent-rpc';
import type { XotiraDarajalari } from '../../src/lib/smeta-ai/tajriba';

/** System, company and personal memory; before the three-level RPC exists, the company memory from the agent environment. */
export async function xotiraOqi(env: AgentRpcEnv, actor: number, kompaniyaId: number, superadmin = false): Promise<XotiraDarajalari & { superadmin?: boolean }> {
  const bosh: XotiraDarajalari = { tizim: [], kompaniya: [], foydalanuvchi: [] };
  const r = await rpcData(env, 't2_smeta_xotira_v1', { p_actor_id: actor, p_kompaniya_id: kompaniyaId }).catch(() => null);
  const toza = (l: unknown) => (Array.isArray(l) ? l as Array<{ kalit: string; mazmun: string }> : []).filter(x => typeof x?.mazmun === 'string' && x.mazmun.trim() && x.mazmun !== '-');
  if (r?.ok) return { tizim: toza(r.data.tizim), kompaniya: toza(r.data.kompaniya), foydalanuvchi: toza(r.data.foydalanuvchi), ...(superadmin ? { superadmin: r.data.superadmin === true } : {}) };
  const m = await rpcData(env, 't2_agent_muhit_v1', { p_actor_id: actor, p_kompaniya_id: kompaniyaId, p_profil: null }).catch(() => null);
  return m?.ok ? { ...bosh, kompaniya: toza(m.data.xotira).filter(x => x.kalit.startsWith('smeta.')) } : bosh;
}
