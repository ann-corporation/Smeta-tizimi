/** Agent RPC chaqiruvi: service_role bilan Supabase RPC; xatolar foydalanuvchiga tushunarli va ichki matnsiz. */
import { supabaseBaseUrl } from './supabase-url';

export type AgentRpcEnv = { SUPABASE_URL?: string; SUPABASE_KEY?: string };
export type Yuk = Record<string, unknown>;
export type RpcNatija = { ok: boolean; status: number; data: Yuk };

export async function rpcData(env: AgentRpcEnv, nom: string, yuk: Yuk): Promise<RpcNatija> {
  const r = await fetch(supabaseBaseUrl(env.SUPABASE_URL!) + '/rest/v1/rpc/' + nom, {
    method: 'POST', headers: { apikey: env.SUPABASE_KEY!, Authorization: 'Bearer ' + env.SUPABASE_KEY!, 'Content-Type': 'application/json' }, body: JSON.stringify(yuk),
  });
  const text = await r.text();
  if (!r.ok) {
    let code = ''; try { code = (JSON.parse(text) as { code?: string }).code ?? ''; } catch { /* matn emas */ }
    return { ok: false, status: code === '42501' ? 403 : code === '22023' ? 400 : 502, data: { ok: false, error: code === '42501' ? 'Bu doiraga ruxsat yo‘q' : 'Server xatosi' } };
  }
  let d: unknown = null;
  try { d = JSON.parse(text); } catch { return { ok: false, status: 502, data: { ok: false, error: 'Noto‘g‘ri javob' } }; }
  const o = (d && typeof d === 'object' ? d : { ok: true, natija: d }) as Yuk;
  return { ok: o.ok !== false, status: o.ok === false ? (o.code === 'GLOBAL_SCOPE_DENIED' || o.code === 'COMPANY_ACCESS_DENIED' || o.code === 'WRITE_ROLE_REQUIRED' ? 403 : 400) : 200, data: o };
}
