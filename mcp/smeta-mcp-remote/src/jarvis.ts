/** Existing worker + SDK/tools, same SSO cookie: no separate login or caller identity. Optional config fails closed. */
import { kalitBormi, tekshir } from '../../../frontend/functions/_shared/auth';
import { roleAuthority } from '../../../frontend/functions/_shared/role-authority';
import { yopiqModul } from '../../../frontend/functions/_shared/permission-policy';
import { SMETA_MCP_PERMISSIONS } from '../../../frontend/src/lib/jarvis/mcp-contract';
import type { Env } from './env';
import { mcpVakolatFetch, type McpCtx } from './mcp';
import type { Vakolat } from './vakolat';

const fail = (status: number, message: string) => Response.json({ jsonrpc: '2.0', id: null,
  error: { code: -32000, message } }, { status });

export async function jarvisFetch(request: Request, env: Env, ctx: Pick<McpCtx, 'waitUntil'>): Promise<Response> {
  if (!kalitBormi(env.SESSIYA_KALIT)) return fail(503, 'SSO_CONFIG_REQUIRED');
  if (request.method !== 'POST') return fail(405, 'POST_REQUIRED');
  const original = await tekshir(request.headers.get('Cookie'), env.SESSIYA_KALIT!).catch(() => null);
  const actor = original?.foydalanuvchi_id;
  if (!original || !Number.isSafeInteger(actor) || !actor || actor <= 0) return fail(401, 'AUTH_REQUIRED');
  return mcpVakolatFetch(request, env, ctx, actor, async () => {
    const s = await roleAuthority(original, env).catch(() => null);
    const company = Number(request.headers.get('X-Jarvis-Company'));
    if (!s || s.foydalanuvchi_id !== actor || !Number.isSafeInteger(company) || company <= 0) return null;
    const member = s.kompaniyalar?.find(k => k.kompaniya_id === company);
    const permissions = s.permissionsByCompany?.[company];
    const denied = s.explicitDenialsByCompany?.[company] ?? [];
    if (!member || !SMETA_MCP_PERMISSIONS.every(p => permissions?.includes(p) && !denied.includes(p)
      && !yopiqModul(p, [company], s.modullarOffByCompany))) return null;
    // Narrow both views; no superadmin bypass or authority in headers/body.
    const sess = { ...s, kompaniyalar: [member], permissionsByCompany: { [company]: permissions! },
      explicitDenialsByCompany: { [company]: denied },
      modullarOffByCompany: s.modullarOffByCompany ? { [company]: s.modullarOffByCompany[company] ?? [] } : undefined };
    return { foydalanuvchiId: actor, superadmin: false, kompaniyalar: [member], sess } satisfies Vakolat;
  }, true);
}
