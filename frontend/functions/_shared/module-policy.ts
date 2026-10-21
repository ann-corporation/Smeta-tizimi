import { supabaseBaseUrl } from './supabase-url';
export type ModuleCode = 'module.narx' | 'module.erp' | 'module.loyiha' | 'module.aosr';

/** Optional module operations only. Core PTO, M-29 and reading context references remain available. */
export function requestModule(api: string, body: Record<string, unknown>, permission: string): ModuleCode | null {
  if (permission.startsWith('narx.')) return 'module.narx';
  if (permission.startsWith('financial.') || ['boss-dashboard','boss-documents'].includes(api)) return 'module.erp';
  const name = String(body.amal ?? body.jadval ?? body.soro ?? '').replace(/^t2_/, '');
  if (/^(aosr|lab_protokol)/.test(name)) return 'module.aosr';
  if (/^(erp_|sklad|kadr|texnika|mindmap)/.test(name)) return 'module.erp';
  if (api === 'tomon' || permission === 'project.write' || (api === 'sb-yoz' && /^(shartnoma_|kontragent_)/.test(name))) return 'module.loyiha';
  return null;
}

export async function moduleAccess(module: ModuleCode, company: number, actor: number, env: { SUPABASE_URL: string; SUPABASE_KEY: string }): Promise<'on' | 'off' | 'unavailable'> {
  try {
    const response = await fetch(supabaseBaseUrl(env.SUPABASE_URL)+'/rest/v1/rpc/t2_modul_holat_v1', {
      method: 'POST', headers: { apikey: env.SUPABASE_KEY, Authorization: 'Bearer '+env.SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_kompaniya_id: company, p_actor_id: actor }),
    });
    if (!response.ok) return 'unavailable';
    const j = await response.json() as { ok?: boolean; modullar?: Array<{ kod: string; holat: string }> };
    const value = j.ok && Array.isArray(j.modullar) ? j.modullar.find(m => m.kod === module)?.holat : null;
    return value === 'on' || value === 'off' ? value : 'unavailable';
  } catch { return 'unavailable'; }
}
