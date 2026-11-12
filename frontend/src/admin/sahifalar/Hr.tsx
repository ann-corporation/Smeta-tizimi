/**
 * HR + KPI (egasi 2026-11-04): xodimlar, kalendar/tatil, tabel, jarima/bonus, KPI panel, ish haqi qoralamasi, sozlamalar.
 * 2026-11-12 «ishga tushirish»: «Mening oyligim va KPI» (hr.* ruxsatisiz ham, faqat o'zi), birinchi marta 3 qadam, KPI qoidalari.
 * Dizayn: docs/architecture/HR_KPI_V1.md. Ruxsatlar RPC ichida (hr.*, payroll.*): sahifa faqat ko'rsatadi.
 */
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { t } from '../../i18n/til';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { useKompaniya } from '../../test02/KompaniyaTanlov';
import { hrKpiOl, hrOyOl, hrQoidaOl, hrXodimlarOl, type HrKpi, type HrOy, type HrQoida, type HrXodimlarJavob } from '../../api/t2-hr';
import { oyKaliti } from '../../lib/hr/hisob';
import { OyTanlov, XatoQutisi, useHrYukla } from '../hr/umumiy';
import { HrSozlamaTab, HrXodimlar } from '../hr/HrXodimlar';
import { HrKalendar, HrTabel } from '../hr/HrTabelKalendar';
import { HrIshHaqi, HrPanel, HrTuzatmalar } from '../hr/HrPul';
import { HrMen } from '../hr/HrMen';
import { HrBoshlash, type BoshlashQadam } from '../hr/HrBoshlash';

type Tab = 'men' | 'xodimlar' | 'tabel' | 'kalendar' | 'tuzatma' | 'panel' | 'oylik' | 'sozlama';
const TABLAR: Array<[Tab, string]> = [
  ['xodimlar', 'Xodimlar'], ['tabel', 'Tabel'], ['kalendar', 'Kalendar va tatil'], ['tuzatma', 'Jarima va bonus'],
  ['panel', 'KPI paneli'], ['oylik', 'Ish haqi'], ['sozlama', 'Sozlamalar'],
];
const OY_KERAK: ReadonlySet<Tab> = new Set(['tabel', 'kalendar', 'tuzatma', 'panel', 'oylik']);
const KPI_KERAK: ReadonlySet<Tab> = new Set(['panel', 'oylik']);
const RUXSAT_YOQ = /PERMISSION_DENIED|42501|403|ruxsat/i;

export default function Hr() {
  const { joriy } = useKompaniya();
  const kid = joriy?.id ?? null;
  const [qs, setQs] = useSearchParams();
  const [tanlangan, setTanlangan] = useState<Tab | null>(() => (qs.get('tab') === 'men' ? 'men' : null));
  const [yangiXodim, setYangiXodim] = useState(0);
  const [oy, setOy] = useState(() => oyKaliti(new Date()));

  const xod = useHrYukla<HrXodimlarJavob>(kid == null ? null : () => hrXodimlarOl(kid), [kid]);
  // hr.* ruxsati yo'q foydalanuvchi: faqat «Mening oyligim» (server o'zi rad etadi - bu faqat ko'rinish).
  const faqatMen = !!xod.xato && RUXSAT_YOQ.test(xod.xato);
  const tab: Tab = faqatMen ? 'men' : (tanlangan ?? 'xodimlar');
  const setTab = (x: Tab) => { setTanlangan(x); if (qs.get('tab')) { const n = new URLSearchParams(qs); n.delete('tab'); setQs(n, { replace: true }); } };
  const qoida = useHrYukla<HrQoida>(kid != null && !faqatMen && (tab === 'xodimlar' || tab === 'sozlama') ? () => hrQoidaOl(kid) : null, [kid, tab, faqatMen]);
  const oyD = useHrYukla<HrOy>(kid != null && !faqatMen && OY_KERAK.has(tab) && !KPI_KERAK.has(tab) ? () => hrOyOl(kid, oy) : null, [kid, oy, tab, faqatMen]);
  const kpi = useHrYukla<HrKpi>(kid != null && !faqatMen && KPI_KERAK.has(tab) ? () => hrKpiOl(kid, oy) : null, [kid, oy, tab, faqatMen]);
  const qaytaHammasi = async () => { await Promise.all([xod.qayta(), oyD.qayta(), kpi.qayta()]); };
  const xato = faqatMen || tab === 'men' ? null : tab === 'xodimlar' || tab === 'sozlama' ? xod.xato : (KPI_KERAK.has(tab) ? kpi.xato : oyD.xato) ?? xod.xato;
  const kompaniyaNom = useMemo(() => joriy?.nom ?? '', [joriy]);
  const boshlash = (q: BoshlashQadam) => {
    if (q === 'xodim') { setYangiXodim((n) => n + 1); setTab('xodimlar'); } else setTab(q === 'sozlama' ? 'sozlama' : 'tabel');
  };
  const tablar: Array<[Tab, string]> = faqatMen ? [['men', 'Mening oyligim va KPI']] : [['men', 'Mening oyligim va KPI'], ...TABLAR];

  return (
    <Sahifa sarlavha={t('Kadrlar, KPI va ish haqi')} tavsif={t('Xodim kartasi, F2 bo‘yicha KPI, jarima/bonus, ish kalendari, tabel va oylik ish haqi qoralamasi.')}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label={t('HR bo‘limlari')}>
          {tablar.map(([k, nom]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={`fz-chip ${tab === k ? 'fz-chip--accent' : ''}`} onClick={() => setTab(k)}>{t(nom)}</button>
          ))}
          {OY_KERAK.has(tab) && <div className="ml-auto"><OyTanlov oy={oy} onChange={setOy} /></div>}
        </div>

        {kid == null && <div className="text-text-dim">{t('Kompaniya tanlanmagan.')}</div>}
        <XatoQutisi xato={xato} />

        {kid != null && tab === 'men' && <HrMen kid={kid} />}
        {kid != null && xod.data && (tab === 'xodimlar' || tab === 'sozlama') && <HrBoshlash d={xod.data} tanla={boshlash} />}
        {kid != null && xod.data && tab === 'xodimlar' && <HrXodimlar key={`x${yangiXodim}`} kid={kid} d={xod.data} qayta={async () => { await Promise.all([xod.qayta(), qoida.qayta()]); }} azolar={qoida.data?.azolar ?? null} boshidaYangi={yangiXodim > 0} />}
        {kid != null && xod.data && tab === 'sozlama' && <HrSozlamaTab key={`${xod.data.sozlama?.versiya ?? 0}-${qoida.data?.kpi_pulga_tasir ? 1 : 0}`} kid={kid} d={xod.data} qayta={xod.qayta} qoida={qoida.data} qoidaQayta={qoida.qayta} />}
        {kid != null && xod.data && oyD.data && tab === 'tabel' && <HrTabel key={oy} kid={kid} oy={oy} d={xod.data} o={oyD.data} qayta={qaytaHammasi} />}
        {kid != null && xod.data && oyD.data && tab === 'kalendar' && <HrKalendar key={oy} kid={kid} oy={oy} d={xod.data} o={oyD.data} qayta={qaytaHammasi} />}
        {kid != null && xod.data && oyD.data && tab === 'tuzatma' && <HrTuzatmalar key={oy} kid={kid} oy={oy} d={xod.data} o={oyD.data} qayta={qaytaHammasi} />}
        {kid != null && kpi.data && tab === 'panel' && <HrPanel kpi={kpi.data} />}
        {kid != null && kpi.data && tab === 'oylik' && <HrIshHaqi kid={kid} oy={oy} kompaniyaNom={kompaniyaNom} kpi={kpi.data} qayta={qaytaHammasi} />}
        {(xod.yuk || oyD.yuk || kpi.yuk) && <div className="text-[12px] text-text-mute" aria-live="polite">{t('Yuklanmoqda…')}</div>}
      </div>
    </Sahifa>
  );
}
