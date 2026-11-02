import { useState } from 'react';
import { Mail, Building, Users } from 'lucide-react';
import TestKorrespondensiya from './TestKorrespondensiya';
import TestSotuvCrm from './TestSotuvCrm';
import TestInvite from './TestInvite';
import { t } from '../i18n/til';

type Tab = 'edo' | 'sotuv' | 'invite';
const TABS: { id: Tab; nom: string; izoh: string; Icon: typeof Mail }[] = [
  { id: 'invite', nom: 'Taklif va bog‘lanish', izoh: 'Hamkorlarni tizimga taklif qilish', Icon: Users },
  { id: 'edo', nom: 'Korrespondensiya (B2B)', izoh: 'Kiruvchi va chiquvchi xatlar', Icon: Mail },
  { id: 'sotuv', nom: 'Uy sotuv (Developer CRM)', izoh: 'Xaridorlar va shartnomalar', Icon: Building },
];

/** CRM: uch bo'lim bitta joyda (Firuza tab qatori; ichki sahifalar o'zgarmaydi). */
export default function WrapperCRM() {
  const [activeTab, setActiveTab] = useState<Tab>('invite');
  return (
    <div className="flex h-full flex-col bg-bg">
      <div role="tablist" aria-label={t('CRM bo‘limlari')} className="flex items-end gap-1 overflow-x-auto border-b border-border bg-surface px-6 pt-3">
        {TABS.map((x) => (
          <button key={x.id} type="button" role="tab" aria-selected={activeTab === x.id} onClick={() => setActiveTab(x.id)} title={t(x.izoh)}
            className={`-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2 text-[13px] font-medium transition-colors ${activeTab === x.id ? 'border-accent text-text' : 'border-transparent text-text-dim hover:text-text'}`}>
            <x.Icon size={16} className={activeTab === x.id ? 'text-accent' : ''} /> {t(x.nom)}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="relative flex-1 overflow-hidden">
        {activeTab === 'invite' && <TestInvite />}
        {activeTab === 'edo' && <TestKorrespondensiya />}
        {activeTab === 'sotuv' && <TestSotuvCrm />}
      </div>
    </div>
  );
}
