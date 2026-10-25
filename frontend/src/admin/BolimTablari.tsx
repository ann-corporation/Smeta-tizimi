import { useContext } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { BolimTablariKontekst, joriyTabGuruhi } from './bolimTablariKontekst';
import { usePTOWorkspace } from '../umumiy/kontekst/PTOWorkspaceContext';
import { t } from '../i18n/til';

/**
 * Tab-qobiq (tizim xaritasi P1): bir sidebar bandi ostidagi sahifalar tepada tab bo'lib turadi.
 * Sahifalar QAYTA YOZILMAGAN — har biri o'z yo'lida (`/admin/f2`, `/admin/f2-tarix` …) `<Outlet/>` orqali
 * ochiladi, shuning uchun eski URL, xatcho'p va `?obyekt=` parametrlari o'zgarmaydi.
 * Tablar sidebar bilan bir manbadan (AdminShell) va ruxsat bo'yicha filtrlangan keladi.
 */
export default function BolimTablari() {
  const { pathname } = useLocation();
  const ws = usePTOWorkspace();
  const tablar = joriyTabGuruhi(useContext(BolimTablariKontekst), pathname);
  /* Tab almashganda obyekt/loyiha/davr konteksti saqlanadi (sahifaga xos boshqa parametrlar — yo'q). */
  const search = ws.scopeSearch(ws.scope.objectId);
  return (
    <div className="flex flex-1 flex-col">
      {tablar && tablar.length > 1 && (
        <nav aria-label={t('Bo‘lim sahifalari')} className="sticky top-0 z-10 flex flex-shrink-0 gap-1 overflow-x-auto border-b border-border bg-bg/90 px-3 backdrop-blur-sm sm:px-4">
          {tablar.map((tb) => (
            <NavLink
              key={tb.yol}
              to={{ pathname: tb.yol, search }}
              end
              className={({ isActive }) => `whitespace-nowrap border-b-2 px-3 py-2 text-[13px] font-medium transition-colors ${isActive ? 'border-accent text-text' : 'border-transparent text-text-dim hover:text-text'}`}
            >
              {t(tb.nom)}
            </NavLink>
          ))}
        </nav>
      )}
      <Outlet />
    </div>
  );
}
