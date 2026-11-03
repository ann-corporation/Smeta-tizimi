import { useState } from 'react';
import { BarChart3, CalendarDays, Calculator, Route as RouteIcon, Truck } from 'lucide-react';
import { t } from '../i18n/til';
import { Sahifa } from '../umumiy/ui/Sahifa';
import { OpsTablar } from '../components/kompaniya-ops/OpsUi';
import { useKompaniya } from '../umumiy/kontekst/KompaniyaKontekst';
import { KompaniyaKerak } from '../umumiy/kontekst/KompaniyaKerak';
import ReyslarTab from './ReyslarTab';
import ParkTab from './ParkTab';
import NarxlashTab from './NarxlashTab';
import FoydaTab from './FoydaTab';
import HaydovchiBugun from './HaydovchiBugun';

type Tab = 'reyslar' | 'park' | 'narx' | 'foyda' | 'bugun';

/** /admin/transport — transport bo'limi (park, reyslar+xarita, narxlash, rentabellik). Ombor (/admin/logistika) dan alohida. */
export default function TransportSahifa() {
  const { joriy, superadmin } = useKompaniya();
  const kid = joriy?.id ?? null;
  const p = new Set(joriy?.permissions ?? []);
  const bor = (x: string) => superadmin || p.has(x);
  const dispetcher = bor('logistics.dispatch'), haydovchi = bor('logistics.trip'), korish = dispetcher || bor('logistics.read') || bor('machinery.read');
  const [tab, setTab] = useState<Tab>(korish ? 'reyslar' : 'bugun');

  if (kid == null) return <Sahifa sarlavha={t('Transport')}><KompaniyaKerak /></Sahifa>;
  const tablar = [
    ...(korish ? [{ id: 'reyslar' as Tab, nom: t('Reyslar'), ikon: <RouteIcon /> }, { id: 'park' as Tab, nom: t('Park'), ikon: <Truck /> }, { id: 'narx' as Tab, nom: t('Narxlash'), ikon: <Calculator /> }, { id: 'foyda' as Tab, nom: t('Rentabellik'), ikon: <BarChart3 /> }] : []),
    ...(haydovchi ? [{ id: 'bugun' as Tab, nom: t('Bugungi reyslarim'), ikon: <CalendarDays /> }] : []),
  ];
  return (
    <Sahifa sarlavha={t('Transport va logistika')} tavsif={t('Park, reyslar va xarita, tannarx, tashqi narxlash va rentabellik. Ichki tannarx QQS siz; mijozga narx QQS bilan.')}>
      <div className="flex flex-col gap-3">
        {tablar.length > 1 && <OpsTablar<Tab> yorliq={t('Transport bo‘limlari')} joriy={tab} onTanla={setTab} tablar={tablar} />}
        {tab === 'reyslar' && korish && <ReyslarTab kompaniyaId={kid} dispetcher={dispetcher} haydovchi={haydovchi} moliyaYozish={bor('financial.write')} />}
        {tab === 'park' && korish && <ParkTab kompaniyaId={kid} yozish={bor('machinery.write')} />}
        {tab === 'narx' && korish && <NarxlashTab kompaniyaId={kid} yozish={dispetcher} />}
        {tab === 'foyda' && korish && <FoydaTab kompaniyaId={kid} />}
        {tab === 'bugun' && haydovchi && <HaydovchiBugun kompaniyaId={kid} />}
        {tablar.length === 0 && <p className="text-[13px] text-text-dim">{t('Transport bo‘limiga ruxsatingiz yo‘q.')}</p>}
      </div>
    </Sahifa>
  );
}
