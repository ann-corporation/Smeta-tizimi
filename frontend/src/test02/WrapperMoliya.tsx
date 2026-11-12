import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Briefcase, CreditCard, FileText, TrendingUp } from 'lucide-react';
import { t } from '../i18n/til';
import { OpsTablar } from '../components/kompaniya-ops/OpsUi';
import TestShartnoma from './TestShartnoma';
import TestTolov from './TestTolov';
import TestFaktura from './TestFaktura';
const FoydaZarar = lazy(() => import('../components/moliya/FoydaZarar'));

type Tab = 'foyda' | 'shartnoma' | 'tolov' | 'faktura';
const TABLAR: readonly Tab[] = ['foyda', 'shartnoma', 'tolov', 'faktura'];

/* 2026-09-30 egasi: "Smeta & F2" tabi olib tashlandi — smeta, F2, fakt PTO bo'limida
   (/admin/holat, /admin/f2); moliya paneli faqat shartnoma, to'lov va fakturalar. */
export default function WrapperMoliya() {
  // Egasi 2026-11-12: «loyiha plyusdami minusdami» — Foyda/zarar birinchi tab; Jarvis ?tab=foyda bilan ochadi.
  const [qs, setQs] = useSearchParams();
  const q = qs.get('tab') as Tab | null;
  const activeTab: Tab = q && TABLAR.includes(q) ? q : 'foyda';
  const setActiveTab = (x: Tab) => setQs((p) => { const n = new URLSearchParams(p); n.set('tab', x); return n; }, { replace: true });
  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-3">
        <OpsTablar<Tab> yorliq={t('Moliya bo‘limlari')} joriy={activeTab} onTanla={setActiveTab} tablar={[
          { id: 'foyda', nom: t('Foyda / zarar'), ikon: <TrendingUp /> },
          { id: 'shartnoma', nom: t('Shartnomalar'), ikon: <Briefcase /> },
          { id: 'tolov', nom: t('To‘lovlar'), ikon: <CreditCard /> },
          { id: 'faktura', nom: t('Fakturalar (PDF, AI)'), ikon: <FileText /> },
        ]} />
      </div>
      <div className="relative flex-1 overflow-hidden">
        {activeTab === 'foyda' && <Suspense fallback={null}><FoydaZarar /></Suspense>}
        {activeTab === 'shartnoma' && <TestShartnoma />}
        {activeTab === 'tolov' && <TestTolov />}
        {activeTab === 'faktura' && <TestFaktura />}
      </div>
    </div>
  );
}
