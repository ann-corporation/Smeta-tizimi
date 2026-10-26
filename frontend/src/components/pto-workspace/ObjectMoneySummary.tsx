import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { T2Obyekt } from '../../api/supabase';
import { FmtN } from '../../lib/format';
import { t } from '../../i18n/til';
import { useCompanyLineage } from './useLineage';
import { useMarkupTotals } from './useMarkupTotals';
import { PortfelSummaJuft } from '../../umumiy/ui/PortfelSummaJuft';

export function ObjectMoneySummary({object}:{object:T2Obyekt}) {
  const {data:line,error:lineError}=useCompanyLineage(object.kompaniya_id);
  const [params]=useSearchParams();
  const objects=useMemo(()=>[object],[object]);
  const totals=useMarkupTotals(object.kompaniya_id,line,objects);
  const requested=line?.shartnomalar.find(s=>s.id===Number(params.get('shartnoma')) && s.loyiha_id===object.loyiha_id && s.obyektlar.includes(object.id));
  const total=totals.sum([object.id],requested?.id);
  return <section className="fz-note fz-note--info flex-wrap items-center gap-x-6 gap-y-1" aria-label={t('Smeta va nakrutka summalari')}>
    <span className="inline-flex items-center gap-2">{t('Smeta summasi')}: <PortfelSummaJuft obyektlar={[{obyektId:object.id,shartnomaId:requested?.id??null}]} ustamasiz={object.jami}/></span>
    <span>{t('Nakrutkalar bilan (QQS bilan)')}: <b>{totals.loading && !lineError ? t('Hisoblanmoqda…') : total.present ? <FmtN val={total.known}/> : t('Noma’lum')}</b></span>
    {total.unknown > 0 && <span className="text-text-mute">{t('narxsiz resurslar summaga kirmagan — Narxlar bo‘limida')}</span>}
    {(totals.failed || lineError) && <span role="status" className="text-warn">{t('Nakrutka hisobi o‘qilmadi. Qayta yangilang.')}<button type="button" className="fz-btn fz-btn--sm ml-2" onClick={totals.retry}>{t('Qayta urinish')}</button></span>}
  </section>;
}
