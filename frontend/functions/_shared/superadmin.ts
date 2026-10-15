/**
 * Fresh superadmin check for platform-wide writes: the session actor is re-verified in the database on EVERY call
 * (t2_boshqaruv_umumiy_v1 raises SUPERADMIN_KERAK otherwise). The cookie role is never the authority.
 */
import { tekshir } from './auth';
import { supabaseBaseUrl } from './supabase-url';

export type SuperadminEnv = { SESSIYA_KALIT: string; SUPABASE_URL: string; SUPABASE_KEY: string };

export async function superadminActor(request: Request, env: SuperadminEnv): Promise<{ id: number } | { code: string; status: number }> {
  const s = await tekshir(request.headers.get('Cookie'), env.SESSIYA_KALIT).catch(() => null);
  if (!s || !Number.isSafeInteger(s.foydalanuvchi_id) || Number(s.foydalanuvchi_id) <= 0) return { code: 'AUTH_REQUIRED', status: 401 };
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return { code: 'CONFIG', status: 503 };
  const r = await fetch(supabaseBaseUrl(env.SUPABASE_URL) + '/rest/v1/rpc/t2_boshqaruv_umumiy_v1', {
    method: 'POST', headers: { apikey: env.SUPABASE_KEY, Authorization: 'Bearer ' + env.SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_actor_id: s.foydalanuvchi_id }),
  });
  if (!r.ok) {
    const denied = /SUPERADMIN_KERAK/.test(await r.text()) || r.status === 401 || r.status === 403;
    return denied ? { code: 'SUPERADMIN_REQUIRED', status: 403 } : { code: 'AUTH_CHECK_FAILED', status: 502 };
  }
  const body: unknown = await r.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body) || !('foydalanuvchi' in body) || ('ok' in body && (body as { ok?: unknown }).ok === false))
    return { code: 'SUPERADMIN_REQUIRED', status: 403 };
  return { id: Number(s.foydalanuvchi_id) };
}
