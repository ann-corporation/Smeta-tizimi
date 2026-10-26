import { useState } from 'react';
import { Briefcase, CreditCard, FileText } from 'lucide-react';
import { t } from '../i18n/til';
import { OpsTablar } from '../components/kompaniya-ops/OpsUi';
import TestShartnoma from './TestShartnoma';
import TestTolov from './TestTolov';
import TestFaktura from './TestFaktura';

type Tab = 'shartnoma' | 'tolov' | 'faktura';

/* 2026-09-30 egasi: "Smeta & F2" tabi olib tashlandi — smeta, F2, fakt PTO bo'limida
   (/admin/holat, /admin/f2); moliya paneli faqat shartnoma, to'lov va fakturalar. */
export default function WrapperMoliya() {
  const [activeTab, setActiveTab] = useState<Tab>('shartnoma');
  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-3">
        <OpsTablar<Tab> yorliq={t('Moliya bo‘limlari')} joriy={activeTab} onTanla={setActiveTab} tablar={[
          { id: 'shartnoma', nom: t('Shartnomalar'), ikon: <Briefcase /> },
          { id: 'tolov', nom: t('To‘lovlar'), ikon: <CreditCard /> },
          { id: 'faktura', nom: t('Fakturalar (PDF, AI)'), ikon: <FileText /> },
        ]} />
      </div>
      <div className="relative flex-1 overflow-hidden">
        {activeTab === 'shartnoma' && <TestShartnoma />}
        {activeTab === 'tolov' && <TestTolov />}
        {activeTab === 'faktura' && <TestFaktura />}
      </div>
    </div>
  );
}
