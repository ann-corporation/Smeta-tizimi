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
 * GLOBAL routes (/admin/kompaniya) are not gated here: their own endpoints
 * (t2_men_v1) do their own authorization and already fail closed.
 *
 * 0. (egasi 2026-10-27) Tizimga oid yo'llar (navReestr.faqatSuperadminYolmi —
 *    menyu filtri bilan BIR XIL manba) faqat platforma superadminiga: boshqalarga
 *    to'g'ridan-to'g'ri URL bilan ham «Ruxsat yo'q». Server ham alohida rad etadi.
 */
import { Outlet, useLocation } from 'react-router-dom';
import { routePermission } from '../../lib/company-authorization/route-permission';
import { faqatSuperadminYolmi } from '../../lib/nav/navReestr';
import { t } from '../../i18n/til';
import { useEffect } from 'react';
import { ShieldAlert, LogOut, RefreshCw } from 'lucide-react';
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
  const matn = reason === 'SUPERADMIN_REQUIRED' ? t('Bu sahifa faqat platforma administratori uchun.') : (REASON_MATN[reason || ''] || 'Bu sahifani ko‘rish uchun ruxsatingiz yo‘q.');
  return (
    <div className="p-8 max-w-lg">
      <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-5 py-4">
        <div className="flex items-center gap-2 text-rose-100 font-medium"><ShieldAlert size={16} /> Ruxsat yo‘q</div>
        <p className="text-[13px] text-rose-100/80 mt-2">
          {matn}
        </p>
        <div className="mt-3">
          {auth
            ? <button onClick={tizimdanChiq} className="inline-flex items-center gap-1.5 rounded-md bg-rose-500/20 hover:bg-rose-500/30 px-3 py-1.5 text-[13px] font-medium text-rose-100"><LogOut size={13} /> Chiqib, qayta kirish</button>
            : <a href="/admin" className="inline-flex items-center gap-1.5 rounded-md bg-white/10 hover:bg-white/15 px-3 py-1.5 text-[13px] font-medium text-text"><RefreshCw size={13} /> Bosh sahifaga qaytish</a>}
        </div>
      </div>
    </div>
  );
}

export function RuxsatGuard() {
  const { pathname } = useLocation();
  const k = useKompaniya();
  const kerak = kompaniyaKerakmi(pathname);

  // 0. Tizimga oid yo'l — faqat platforma superadmini (kontekst yuklanguncha hech narsa chizilmaydi).
  if (faqatSuperadminYolmi(pathname)) {
    if (k.yuklanmoqda) return <KompaniyaKerak />;
    if (!k.superadmin) return <RuxsatYoq reason="SUPERADMIN_REQUIRED" />;
  }

  // Company context still resolving, or route doesn't need one -> render.
  if (!kerak) return <Outlet />;
  if (k.yuklanmoqda) return <KompaniyaKerak />; // shows its own spinner state

  // No selected company (global rejim, no membership, or unselected) ->
  // existing professional empty state; nothing protected renders.
  if (!k.joriyId) return <KompaniyaKerak />;
  if(!k.superadmin && k.joriy?.permissions && !k.joriy.permissions.includes(routePermission(pathname))) return <RuxsatYoq reason="PERMISSION_DENIED"/>;

  return <ServerAuthGate kompaniyaId={k.joriyId} />;
}

/**
 * Sessiya keshi: shu brauzer sessiyasida (tab) shu kompaniya uchun server `allowed` degan bo'lsa, qayta yuklashda
 * sahifa qobig'i 5–9 s «Ruxsat tekshirilmoqda…» bilan bloklanmaydi — kontent darhol chiziladi, server tekshiruvi
 * parallel qayta o'tadi va rad bo'lsa «Ruxsat yo'q» bilan almashtiradi (keshni ham o'chiradi). Ma'lumot endpointlari
 * baribir serverda alohida avtorizatsiyadan o'tadi; kesh faqat qisqa muddatli (TTL) va tizimdan chiqishda tozalanadi.
 */
const RUXSAT_KESH_PREFIKS = 'fz-ruxsat-ok:';
const RUXSAT_KESH_TTL_MS = 10 * 60 * 1000;
export function ruxsatKeshOqi(kompaniyaId: number): boolean {
  try {
    const v = Number(sessionStorage.getItem(RUXSAT_KESH_PREFIKS + kompaniyaId));
    return Number.isFinite(v) && v > 0 && Date.now() - v < RUXSAT_KESH_TTL_MS;
  } catch { return false; }
}
export function ruxsatKeshYoz(kompaniyaId: number, ok: boolean) {
  try {
    if (ok) sessionStorage.setItem(RUXSAT_KESH_PREFIKS + kompaniyaId, String(Date.now()));
    else sessionStorage.removeItem(RUXSAT_KESH_PREFIKS + kompaniyaId);
  } catch { /* xotira yopiq — kesh yo'q, oddiy tekshiruv */ }
}

/** Ruxsat aniqlanguncha ko'rinadigan skelet (matnli spinner emas): sahifa qobig'i bo'sh ekran bo'lib turmaydi. */
function RuxsatSkelet() {
  return (
    <div className="p-4 md:p-8 flex flex-col gap-3" role="status" aria-busy="true" aria-label={t('Yuklanmoqda…')} data-testid="ruxsat-skelet">
      <div className="h-7 w-1/2 max-w-xs rounded bg-surface-2 animate-pulse" />
      <div className="h-24 w-full rounded-lg bg-surface-2 animate-pulse" />
      <div className="h-24 w-full rounded-lg bg-surface-2 animate-pulse" />
    </div>
  );
}

function ServerAuthGate({ kompaniyaId }: { kompaniyaId: number }) {
  const az = useAuthorize('company.read', kompaniyaId, true);
  const allowed = !!az.data?.allowed;
  useEffect(() => {
    if (az.isSuccess) ruxsatKeshYoz(kompaniyaId, allowed);
    else if (az.isError) ruxsatKeshYoz(kompaniyaId, false);
  }, [az.isSuccess, az.isError, allowed, kompaniyaId]);

  if (az.isLoading) {
    // Keshlangan «ruxsat bor» — kontentni darhol chizamiz (server tekshiruvi parallel); aks holda skelet.
    return ruxsatKeshOqi(kompaniyaId) ? <Outlet /> : <RuxsatSkelet />;
  }
  if (az.isError) {
    return <RuxsatYoq reason={(az.error as any)?.code} />;
  }
  if (!allowed) {
    return <RuxsatYoq reason={az.data?.reason} />;
  }
  return <Outlet />;
}
