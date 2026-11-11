/**
 * Tomonlar -> Kontragentlar (ekotizim V3, takroriy yuzalarni birlashtirish): bitta joy.
 * Avval uch xil ekran bor edi: CRM (/admin/crm: taklif + xatlar + uy sotish), Logistika -> Kontragentlar va Tomonlar aloqasi (/admin/aloqalar).
 *   - «Kontragentlar»        - o'z reestringiz (rekvizit, rol)                 (avval Logistika -> Kontragentlar)
 *   - «Platformadagi tomonlar» - boshqa kompaniya bilan ulanish va ko'rish huquqi (avval /admin/aloqalar; CRM «Taklif» tabi — soxta/qurilmagan edi, olib tashlandi)
 *   - «Xatlar»               - kiruvchi/chiquvchi B2B xatlar                   (avval CRM -> Korrespondensiya)
 *   - «Uy sotish xaridorlari» - Developer CRM                                   (avval CRM -> Uy sotuv)
 * Eski yo'llar (/admin/crm, /admin/aloqalar, /admin/test/kontragent) shu sahifaga yo'naltiriladi (?tab=).
 */
import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Building2, Handshake, Home, Mail } from 'lucide-react';
import { OpsTablar } from '../../components/kompaniya-ops/OpsUi';
import { SahifaYuklanmoqda } from '../../umumiy/ui/SahifaYuklanmoqda';
import { t } from '../../i18n/til';

const TestKontragent = lazy(() => import('../../test02/TestKontragent'));
const TomonlarAloqa = lazy(() => import('../zakazchik/TomonlarAloqa'));
const TestKorrespondensiya = lazy(() => import('../../test02/TestKorrespondensiya'));
const TestSotuvCrm = lazy(() => import('../../test02/TestSotuvCrm'));

export type KontragentTab = 'kontragent' | 'aloqa' | 'xat' | 'sotuv';
export const KONTRAGENT_TABLAR: readonly KontragentTab[] = ['kontragent', 'aloqa', 'xat', 'sotuv'];
export const kontragentTab = (v: string | null): KontragentTab => (KONTRAGENT_TABLAR as readonly string[]).includes(v ?? '') ? (v as KontragentTab) : 'kontragent';

export default function Kontragentlar() {
  const [params, setParams] = useSearchParams();
  const tab = kontragentTab(params.get('tab'));
  const tanla = (k: KontragentTab) => setParams(k === 'kontragent' ? {} : { tab: k }, { replace: true });
  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-3">
        <OpsTablar<KontragentTab> yorliq={t('Kontragentlar bo‘limlari')} joriy={tab} onTanla={tanla} tablar={[
          { id: 'kontragent', nom: t('Kontragentlar'), ikon: <Building2 /> },
          { id: 'aloqa', nom: t('Platformadagi tomonlar'), ikon: <Handshake /> },
          { id: 'xat', nom: t('Xatlar'), ikon: <Mail /> },
          { id: 'sotuv', nom: t('Uy sotish xaridorlari'), ikon: <Home /> },
        ]} />
      </div>
      <div className="relative flex-1 overflow-auto">
        <Suspense fallback={<SahifaYuklanmoqda />}>
          {tab === 'kontragent' && <TestKontragent />}
          {tab === 'aloqa' && <TomonlarAloqa />}
          {tab === 'xat' && <TestKorrespondensiya />}
          {tab === 'sotuv' && <TestSotuvCrm />}
        </Suspense>
      </div>
    </div>
  );
}
