import { useState } from 'react';
import { AlertTriangle, Download } from 'lucide-react';
import { t } from '../i18n/til';
import { OpsKpi, OpsKpiQator, OpsBoshQator } from '../components/kompaniya-ops/OpsUi';
import { toast } from '../umumiy/ui/Toast';
import type { Kpi, KpiQator } from '../api/t2-transport';
import { bandlikFoiz, kpiKorsatkich } from '../lib/transport/foyda';
import { useTKpi } from './hooks';
import { bugunISO, foiz, oyBoshiISO, som, son } from './format';
import { kpiXlsx } from './eksport';

const GURUH = (): Array<{ k: KpiQator['guruh']; nom: string }> => [{ k: 'mashina', nom: t('Mashina bo‘yicha') }, { k: 'haydovchi', nom: t('Haydovchi bo‘yicha') }, { k: 'marshrut', nom: t('Marshrut bo‘yicha') }];

function Jadval({ qatorlar, bandlik, kunlar }: { qatorlar: KpiQator[]; bandlik?: Kpi['bandlik']; kunlar: number }) {
  return (
    <div className="overflow-x-auto"><table className="fz-table w-full text-[12px]">
      <thead><tr><th>{t('Nomi')}</th><th>{t('Reys')}</th><th>{t('Km')}</th><th>{t('Bo‘sh yurish')}</th><th>{t('Tannarx (QQS siz)')}</th><th>{t('Daromad (QQS bilan)')}</th><th>{t('Foyda (QQS siz)')}</th><th>{t('Marja')}</th><th>{t('t·km tannarxi')}</th><th>{t('Yoqilg‘i og‘ishi')}</th>{bandlik && <th>{t('Bandlik')}</th>}</tr></thead>
      <tbody>
        {qatorlar.length === 0 && <OpsBoshQator ustun={bandlik ? 11 : 10} matn={t('Ma‘lumot yo‘q')} />}
        {qatorlar.map((q) => {
          const k = kpiKorsatkich(q); const b = bandlik?.find((x) => String(x.mashina_id) === q.kalit);
          return (
            <tr key={`${q.guruh}${q.kalit}`}><td className="font-medium">{q.nom ?? '—'}</td><td className="num">{q.reys}</td><td className="num">{son(q.km, 0)}</td><td className="num">{foiz(k.boshYurishFoiz)}</td>
              <td className="num">{som(q.xarajat)}{q.toliq_emas > 0 && <small className="text-warn"> ({t('{n} reys to‘liq emas', { n: q.toliq_emas })})</small>}</td>
              <td className="num">{som(q.daromad_qqs_bilan)}{q.narxsiz > 0 && <small className="text-text-mute"> ({t('{n} reysda narx yo‘q', { n: q.narxsiz })})</small>}</td>
              <td className={`num ${q.foyda != null && q.foyda < 0 ? 'text-danger' : ''}`}>{som(q.foyda)}</td><td className="num">{foiz(k.margaFoiz)}</td>
              <td className="num">{som(k.tonnaKmTannarx)}</td><td className={`num ${k.yoqilgiOgishFoiz != null && k.yoqilgiOgishFoiz > 10 ? 'text-danger' : ''}`}>{foiz(k.yoqilgiOgishFoiz)}</td>
              {bandlik && <td className="num">{b ? foiz(bandlikFoiz(b.band_kun, kunlar)) : '—'}</td>}</tr>);
        })}
      </tbody></table></div>
  );
}

export default function FoydaTab({ kompaniyaId }: { kompaniyaId: number }) {
  const [dan, setDan] = useState(oyBoshiISO()); const [gacha, setGacha] = useState(bugunISO());
  const kpi = useTKpi(kompaniyaId, dan, gacha);
  const d = kpi.data;
  const jami = d?.qatorlar.find((q) => q.guruh === 'jami');
  const jk = jami ? kpiKorsatkich(jami) : null;
  const eksport = async () => {
    if (!d) return;
    try { const f = await kpiXlsx(d); const url = URL.createObjectURL(new Blob([f.bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = document.createElement('a'); a.href = url; a.download = f.faylNomi; a.click(); URL.revokeObjectURL(url); }
    catch { toast(t('Excel yaratib bo‘lmadi'), 'danger'); }
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" aria-label={t('Dan')} value={dan} onChange={(e) => setDan(e.target.value)} className="h-8 rounded-lg border border-border bg-bg px-2 text-[12px]" />
        <input type="date" aria-label={t('Gacha')} value={gacha} onChange={(e) => setGacha(e.target.value)} className="h-8 rounded-lg border border-border bg-bg px-2 text-[12px]" />
        <button type="button" className="fz-btn ml-auto" onClick={() => void eksport()} disabled={!d}><Download />{t('Excelga yuklash')}</button>
      </div>
      {kpi.isError && <div role="alert" className="rounded-lg border border-danger px-3 py-2 text-[12px] text-danger">{t('Ko‘rsatkichlarni o‘qib bo‘lmadi.')}</div>}
      {d && (d.hujjat_signal.otgan > 0 || d.hujjat_signal.yaqin > 0) && (
        <div className="flex items-center gap-2 rounded-lg border border-warn px-3 py-2 text-[12px]"><AlertTriangle className="h-4 w-4 text-warn" />
          {t('Hujjat muddati: {a} ta o‘tgan, {b} ta 30 kun ichida tugaydi (Park bo‘limi).', { a: d.hujjat_signal.otgan, b: d.hujjat_signal.yaqin })}</div>)}
      <OpsKpiQator yorliq={t('Transport ko‘rsatkichlari')}>
        <OpsKpi nom={t('Reyslar (yetkazilgan/yopilgan)')} qiymat={son(jami?.reys ?? 0, 0)} ost={`${son(jami?.km, 0)} ${t('km')}`} />
        <OpsKpi nom={t('Tannarx (QQS siz)')} qiymat={som(jami?.xarajat)} ost={jami && jami.toliq_emas > 0 ? t('{n} reys to‘liq emas', { n: jami.toliq_emas }) : undefined} />
        <OpsKpi nom={t('Daromad (QQS bilan)')} qiymat={som(jami?.daromad_qqs_bilan)} ost={`${som(jami?.daromad_qqs_siz)} ${t('QQS siz')}`} />
        <OpsKpi nom={t('Foyda (QQS siz)')} qiymat={som(jami?.foyda)} rang={jami?.foyda != null && jami.foyda < 0 ? 'var(--danger)' : 'var(--ok)'} ost={`${t('Marja')}: ${foiz(jk?.margaFoiz)}`} />
        <OpsKpi nom={t('Bo‘sh yurish')} qiymat={foiz(jk?.boshYurishFoiz)} ost={t('kiritilgan reyslar bo‘yicha')} />
        <OpsKpi nom={t('1 t·km tannarxi')} qiymat={som(jk?.tonnaKmTannarx)} ost={t('yuk og‘irligi ma‘lum reyslar')} />
        <OpsKpi nom={t('Yoqilg‘i og‘ishi')} qiymat={foiz(jk?.yoqilgiOgishFoiz)} ost={t('haqiqiy / me‘yor')} />
      </OpsKpiQator>
      <p className="text-[11px] text-text-mute">{d?.qqs_izoh}</p>
      {GURUH().map((g) => (
        <section key={g.k}><h3 className="mb-1 text-[14px] font-semibold">{g.nom}</h3>
          <Jadval qatorlar={(d?.qatorlar ?? []).filter((q) => q.guruh === g.k)} bandlik={g.k === 'mashina' ? d?.bandlik : undefined} kunlar={d?.kunlar ?? 1} /></section>))}
    </div>
  );
}
