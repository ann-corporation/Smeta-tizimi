import { sessiyaOl } from '../../_shared/auth';
import { desktopCsrfAllowed, desktopFail, positiveId, verifiedDesktopDevice, type DesktopEnv } from '../../_shared/desktop-device';
import { LEASE_MAX_MS, signDesktopLease, type DesktopLeaseEnv } from '../../_shared/desktop-lease';
import { roleAuthority, sessiyaYaroqsizmi, yaroqsizSessiyaJavob } from '../../_shared/role-authority';
import { azoKompaniyalar } from '../../_shared/tenant-oqish';
import { otaKompaniyasi } from '../../_shared/ota-kompaniya';
import { PAKET_RUXSATLARI } from '../obyekt-paket';

export const onRequestPost: PagesFunction<DesktopEnv & DesktopLeaseEnv> = async ctx => {
  const sess = await sessiyaOl(ctx.request, ctx.env);
  const device = verifiedDesktopDevice(ctx.request);
  if (!sess || !device) return desktopFail(401, 'DEVICE_AUTH_REQUIRED');
  if (!desktopCsrfAllowed(ctx.request)) return desktopFail(403, 'ORIGIN_INVALID');
  const authority = await roleAuthority(sess, ctx.env);
  if (!authority && sessiyaYaroqsizmi(sess)) return yaroqsizSessiyaJavob();
  if (!authority) return desktopFail(503, 'AUTHORITY_UNAVAILABLE');
  let b: Record<string, unknown>;
  try { b = await ctx.request.json(); } catch { return desktopFail(400, 'BODY_INVALID'); }
  if (!b || !positiveId(b.kompaniya_id) || !Array.isArray(b.obyekt_idlar) ||
    !b.obyekt_idlar.length || b.obyekt_idlar.length > 100 || !b.obyekt_idlar.every(positiveId) ||
    new Set(b.obyekt_idlar).size !== b.obyekt_idlar.length) return desktopFail(400, 'SCOPE_INVALID');
  const kid = b.kompaniya_id;
  if (!azoKompaniyalar(authority).includes(kid)) return desktopFail(403, 'TENANT_FORBIDDEN');
  const rights = authority.permissionsByCompany?.[kid];
  // Same packet read checks as the BFF. Superadmin still needs explicit membership above.
  if (authority.rol !== 'superadmin') {
    if (!rights) return desktopFail(503, 'AUTHORITY_SCHEMA_REQUIRED');
    if (!['company.read', ...PAKET_RUXSATLARI].every(p => rights.includes(p))) return desktopFail(403, 'PERMISSION_DENIED');
  }
  try {
    for (const id of b.obyekt_idlar) {
      if (await otaKompaniyasi(ctx.env, 't2_obyekt', id) !== kid) return desktopFail(403, 'TENANT_FORBIDDEN');
    }
  } catch { return desktopFail(503, 'SCOPE_UNAVAILABLE'); }
  const now = Date.now();
  try {
    const lease = await signDesktopLease({
      format: 'smeta-desktop-lease/1', foydalanuvchi_id: device.foydalanuvchi_id, kompaniya_id: kid,
      obyekt_idlar: b.obyekt_idlar, permissions: ['company.read', ...PAKET_RUXSATLARI],
      device_id: device.device_id, berildi: now, tugaydi: Math.min(now + LEASE_MAX_MS, device.tugaydi, device.sessiya_exp), versiya: device.versiya,
    }, ctx.env);
    return Response.json({ ok: true, lease }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return desktopFail(503, 'DESKTOP_LEASE_CONFIG'); }
};
