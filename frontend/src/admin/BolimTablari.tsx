import { useContext, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { BolimTablariKontekst, joriyTabGuruhi, tabXotiraKaliti, tabXotiraOl, tabXotiraYoz } from './bolimTablariKontekst';
import { usePTOWorkspace } from '../umumiy/kontekst/PTOWorkspaceContext';
import { t } from '../i18n/til';

/**
 * Tab-qobiq (tizim xaritasi P1): bir sidebar bandi ostidagi sahifalar tepada tab bo'lib turadi.
 * Sahifalar QAYTA YOZILMAGAN — har biri o'z yo'lida (`/admin/f2`, `/admin/f2-tarix` …) `<Outlet/>` orqali
 * ochiladi, shuning uchun eski URL, xatcho'p va `?obyekt=` parametrlari o'zgarmaydi.
 * Tablar sidebar bilan bir manbadan (AdminShell) va ruxsat bo'yicha filtrlangan keladi.
 */
export default function BolimTablari() {
  const { pathname, search } = useLocation();
  const ws = usePTOWorkspace();
  const tablar = joriyTabGuruhi(useContext(BolimTablariKontekst), pathname);
  const kompaniyaId = ws.companyId;
  const obyektId = ws.scope.objectId;
  const joriyTab = tablar?.find((tb) => pathname === tb.yol || pathname.startsWith(tb.yol + '/')) ?? null;

  /* JQA-07: joriy tabning oxirgi URL'i (kompaniya+obyekt bo'yicha) eslab qolinadi — qaytganda o'sha holat bilan ochiladi. */
  useEffect(() => {
    if (joriyTab) tabXotiraYoz(tabXotiraKaliti(kompaniyaId, obyektId, joriyTab.yol), search);
  }, [joriyTab, kompaniyaId, obyektId, search]);

  /* Tab havolasi: shu tabning o'z oxirgi query'si bo'lsa — o'sha; bo'lmasa obyekt/loyiha/davr konteksti (scopeSearch). */
  const tabSearch = (yol: string) => (joriyTab?.yol === yol ? search : tabXotiraOl(tabXotiraKaliti(kompaniyaId, obyektId, yol))) ?? ws.scopeSearch(obyektId);

  return (
    <div className="flex flex-1 flex-col">
      {tablar && tablar.length > 1 && (
        <nav aria-label={t('Bo‘lim sahifalari')} className="sticky top-0 z-10 flex flex-shrink-0 gap-1 overflow-x-auto border-b border-border bg-bg/90 px-3 backdrop-blur-sm sm:px-4">
          {tablar.map((tb) => (
            <NavLink
              key={tb.yol}
              to={{ pathname: tb.yol, search: tabSearch(tb.yol) }}
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
