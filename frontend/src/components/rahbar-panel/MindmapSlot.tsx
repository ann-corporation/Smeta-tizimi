/**
 * Rahbar panelidagi MINDMAP (egasi 2026-10-26: «alohida menyudagi mindmapni sug'urib, panelga bir ekranning ma'lum
 * joyiga qo'yish kerak … joyida ham tursin, lekin o'sha mindmap modeli rahbar panelida ko'rinishi kerak»).
 *
 * Kichik nusxa (MindmapKichik / radial xarita) EMAS — /admin/mindmap dagi AYNAN o'sha komponent (TestXarita: daraxt,
 * ro'yxat, 2D/3D, tahrir, tugun paneli) belgilangan balandlikdagi oynada. Bitta manba (t2_mindmap_grafi), ikkita joy.
 */
import { lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { Maximize2, Network } from 'lucide-react';
import { t } from '../../i18n/til';
import type { BossExecutive } from '../boss-decision/model';

const Mindmap = lazy(() => import('../../test02/TestXarita'));

export function MindmapSlot({ kompaniyaId }: { kompaniyaId: number; kompaniyaNom?: string; e?: BossExecutive | null }) {
  const havola = `/admin/mindmap?tugun=${encodeURIComponent(`kompaniya:${kompaniyaId}`)}`;
  return (
    <section data-testid="rahbar-mindmap-slot" className="fz-card flex min-w-0 flex-col overflow-hidden" aria-label={t('Kompaniya xaritasi (mindmap)')}>
      <div className="fz-card__head">
        <div>
          <h2 className="fz-card__title flex items-center gap-2"><Network size={15} aria-hidden="true" /> {t('Kompaniya xaritasi (mindmap)')}</h2>
          <p className="fz-card__sub">{t('Mindmap sahifasidagi xaritaning o‘zi: tugunni bosing — tafsilot, holat va bo‘limga o‘tish.')}</p>
        </div>
        <Link to={havola} className="fz-btn fz-btn--sm"><Maximize2 size={13} aria-hidden="true" />{t('To‘liq ekranda ochish')}</Link>
      </div>
      <div className="relative h-[72vh] min-h-[560px] max-h-[860px] border-t border-border">
        <Suspense fallback={<div className="skel h-full w-full" />}>
          <Mindmap />
        </Suspense>
      </div>
    </section>
  );
}
