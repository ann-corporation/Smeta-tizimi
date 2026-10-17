/**
 * RuxsatGuard — Direct URL professional guard (T2-COMPANY-CONTROL-CLOSEOUT
 * Phase A P0 #3). Wraps <Outlet/> inside AdminShell so EVERY /admin/* child
 * route goes through it, not just the ones whose own page happens to call
 * useKompaniya()/KompaniyaKerak.
 *
 * Two layers, both required — menu-hiding alone is NOT security:
 *   1. COMPANY_SCOPED/PROJECT_SCOPED/OBJECT_SCOPED routes with no company
 *      selected (or superadmin in Global rejim) -> <KompaniyaKerak/>.
 *   2. A company IS selected -> a REAL server call to
 *      t2_effective_authorization_v1 (via useAuthorize) gates the render.
 *      A stale/forged company id or a since-revoked membership is rejected
 *      here, server-side — not just hidden from the sidebar.
 * GLOBAL routes (/admin/kompaniya, /admin/system-control) are not gated
 * here: their own endpoints (t2_men_v1, t2_system_control_global_v1) do
 * their own authorization and already fail closed.
 */
import { Outlet, useLocation } from 'react-router-dom';
import { routePermission } from '../../lib/company-authorization/route-permission';
import { ShieldAlert, LogOut, RefreshCw, Loader2 } from 'lucide-react';
import { useKompaniya } from './KompaniyaKontekst';
import { KompaniyaKerak } from './KompaniyaKerak';
import { kompaniyaKerakmi } from './routeScope';
import { useAuthorize } from '../../api/t2-authz';
import { tizimdanChiq } from './chiqish';

const REASON_MATN: Record<string, string> = {
  COMPANY_MEMBERSHIP_REQUIRED: 'Bu kompaniyaga a’zoligingiz yo‘q (yoki bekor qilingan).',
  UNKNOWN_ROLE: 'Rolingiz tanilmadi. Administratorga murojaat qiling.',
  TARGET_SCOPE_INVALID: 'Bu kompaniya topilmadi yoki faol emas.',
  PERMISSION_DENIED: 'Rolingiz bu sahifaga ruxsat bermaydi.',
  AUTH_REQUIRED: 'Sessiya muddati tugagan.',
};

function RuxsatYoq({ reason }: { reason?: string }) {
  const auth = reason === 'AUTH_REQUIRED';
  return (
    <div className="p-8 max-w-lg">
      <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-5 py-4">
        <div className="flex items-center gap-2 text-rose-100 font-medium"><ShieldAlert size={16} /> Ruxsat yo‘q</div>
        <p className="text-[13px] text-rose-100/80 mt-2">
          {REASON_MATN[reason || ''] || 'Bu sahifani ko‘rish uchun ruxsatingiz yo‘q.'}
        </p>
        <div className="mt-3">
          {auth
            ? <button onClick={tizimdanChiq} className="inline-flex items-center gap-1.5 rounded-md bg-rose-500/20 hover:bg-rose-500/30 px-3 py-1.5 text-[13px] font-medium text-rose-100"><LogOut size={13} /> Chiqib, qayta kirish</button>
            : <a href="/admin/dashboard" className="inline-flex items-center gap-1.5 rounded-md bg-white/10 hover:bg-white/15 px-3 py-1.5 text-[13px] font-medium text-text"><RefreshCw size={13} /> Bosh sahifaga qaytish</a>}
        </div>
      </div>
    </div>
  );
}

export function RuxsatGuard() {
  const { pathname } = useLocation();
  const k = useKompaniya();
  const kerak = kompaniyaKerakmi(pathname);

  // Company context still resolving, or route doesn't need one -> render.
  if (!kerak) return <Outlet />;
  if (k.yuklanmoqda) return <KompaniyaKerak />; // shows its own spinner state

  // No selected company (global rejim, no membership, or unselected) ->
  // existing professional empty state; nothing protected renders.
  if (!k.joriyId) return <KompaniyaKerak />;
  if(!k.superadmin && k.joriy?.permissions && !k.joriy.permissions.includes(routePermission(pathname))) return <RuxsatYoq reason="PERMISSION_DENIED"/>;

  return <ServerAuthGate kompaniyaId={k.joriyId} />;
}

function ServerAuthGate({ kompaniyaId }: { kompaniyaId: number }) {
  const az = useAuthorize('company.read', kompaniyaId, true);

  if (az.isLoading) {
    return (
      <div className="p-8 text-sm text-text-dim flex items-center gap-2">
        <Loader2 size={15} className="animate-spin" /> Ruxsat tekshirilmoqda…
      </div>
    );
  }
  if (az.isError) {
    return <RuxsatYoq reason={(az.error as any)?.code} />;
  }
  if (!az.data?.allowed) {
    return <RuxsatYoq reason={az.data?.reason} />;
  }
  return <Outlet />;
}
