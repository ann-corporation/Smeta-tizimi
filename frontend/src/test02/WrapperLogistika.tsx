import { useState } from 'react';
import { Box, ShoppingCart, Layers, ClipboardList } from 'lucide-react';
import { t } from '../i18n/til';
import { OpsTablar } from '../components/kompaniya-ops/OpsUi';
import TestSklad from './TestSklad';
import TestBirja from './TestBirja';
import TestMaterialAlias from './TestMaterialAlias';
import TestZayavka from './TestZayavka';

type Tab = 'zayavka' | 'sklad' | 'birja' | 'alias';

/** Logistika: zayavka (talab) → sklad (qoldiq) → birja (xarid) → material nomlari sozlamasi.
 *  Kontragentlar bu yerdan olib tashlandi: Tomonlar → Kontragentlar (/admin/kontragentlar) — yagona joy. */
export default function WrapperLogistika() {
  const [activeTab, setActiveTab] = useState<Tab>('zayavka');
  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-3">
        <OpsTablar<Tab> yorliq={t('Logistika bo‘limlari')} joriy={activeTab} onTanla={setActiveTab} tablar={[
          { id: 'zayavka', nom: t('Zayavkalar'), ikon: <ClipboardList /> },
          { id: 'sklad', nom: t('Sklad (qoldiq)'), ikon: <Box /> },
          { id: 'birja', nom: t('Ta’minot va birja'), ikon: <ShoppingCart /> },
          { id: 'alias', nom: t('Material nomlari (AI)'), ikon: <Layers /> },
        ]} />
      </div>
      <div className="relative flex-1 overflow-hidden">
        {activeTab === 'zayavka' && <TestZayavka />}
        {activeTab === 'sklad' && <TestSklad />}
        {activeTab === 'birja' && <TestBirja />}
        {activeTab === 'alias' && <TestMaterialAlias />}
      </div>
    </div>
  );
}
