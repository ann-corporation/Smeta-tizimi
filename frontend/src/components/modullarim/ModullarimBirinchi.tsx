/**
 * ModullarimBirinchi — shu kompaniyada birinchi kirishda «Qaysi modullar kerak?» oynasi. Majburiy emas: «Keyinroq» yoki saqlashdan
 * keyin shu brauzerda qayta chiqmaydi (localStorage — qulaylik). Server tanlovi bo'lsa (boshqa qurilmada tanlangan) ko'rsatilmaydi.
 */
import { useEffect, useState } from 'react';
import { useModulTanlov, korildiOl } from '../../api/modullarim';
import { t } from '../../i18n/til';
import { ModullarimTanlagich } from './ModullarimTanlagich';

export function ModullarimBirinchi({ kompaniyaId }: { kompaniyaId: number }) {
  const q = useModulTanlov(kompaniyaId);
  const [yopiq, setYopiq] = useState(false);
  useEffect(() => { setYopiq(false); }, [kompaniyaId]);
  if (yopiq || !q.data || q.data.tanlangan.length > 0 || q.data.versiya > 0 || korildiOl(kompaniyaId)) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div role="dialog" aria-modal="true" aria-labelledby="modullarim-birinchi-sarlavha" className="fz-card w-full max-w-2xl max-h-[90vh] overflow-y-auto p-4 flex flex-col gap-3">
        <h2 id="modullarim-birinchi-sarlavha" className="text-[16px] font-semibold text-text m-0">{t('Qaysi modullar kerak?')}</h2>
        <ModullarimTanlagich kompaniyaId={kompaniyaId} onTayyor={() => setYopiq(true)} onKeyin={() => setYopiq(true)} />
      </div>
    </div>
  );
}
