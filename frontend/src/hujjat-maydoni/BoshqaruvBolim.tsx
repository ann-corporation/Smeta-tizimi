/**
 * BoshqaruvBolim.tsx - ⚙ menyudagi «Boshqaruv»: disk hajmi, tarif, a'zo kvotalari, sozlamalar (kompaniya boshqaruvchisi; server tekshiradi).
 * R2 dublikatlar, DB hajmi va Tungi arxiv - FAQAT platforma superadmini uchun va FAQAT shu yerda; boshqa rolda DOM da umuman chiqmaydi.
 */
import { useKompaniya } from '../umumiy/kontekst/KompaniyaKontekst';
import { KompaniyaKerak } from '../umumiy/kontekst/KompaniyaKerak';
import { R2DublikatPanel } from '../admin/sahifalar/R2DublikatPanel';
import { DbHajmPanel } from '../admin/sahifalar/DbHajmPanel';
import { t } from '../i18n/til';
import { AdminPanel } from './AdminPanel';

export function BoshqaruvBolim({ kompaniyaId }: { kompaniyaId: number | null }) {
  const { superadmin } = useKompaniya();
  return (
    <div className="space-y-4">
      {kompaniyaId && <AdminPanel kompaniyaId={kompaniyaId} />}
      {!kompaniyaId && !superadmin && <KompaniyaKerak nima="Disk boshqaruvi" />}
      {superadmin && (
        <section className="space-y-3" aria-label={t('Platforma tashxisi')}>
          <h2 className="fz-panel__h">{t('Platforma tashxisi (faqat superadmin)')}</h2>
          <DbHajmPanel />
          <R2DublikatPanel />
        </section>)}
    </div>
  );
}