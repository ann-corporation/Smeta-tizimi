import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { T2Obyekt } from '../../api/supabase';
import { FmtN } from '../../lib/format';
import { t } from '../../i18n/til';
import { useCompanyLineage } from './useLineage';
import { useMarkupTotals } from './useMarkupTotals';

export function ObjectMoneySummary({object}:{object:T2Obyekt}) {
  const {data:line,error:lineError}=useCompanyLineage(object.kompaniya_id);
  const [params]=useSearchParams();
  const objects=useMemo(()=>[object],[object]);
  const totals=useMarkupTotals(object.kompaniya_id,line,objects);
  const requested=line?.shartnomalar.find(s=>s.id===Number(params.get('shartnoma')) && s.loyiha_id===object.loyiha_id && s.obyektlar.includes(object.id));
  const total=totals.sum([object.id],requested?.id);
  return <section className="karta flex flex-wrap gap-x-6 gap-y-2 p-3 text-[12px]" aria-label={t('Smeta va nakrutka summalari')}>
    <span>{t('Nakrutkasiz summa')}: <b><FmtN val={object.jami}/></b></span>
    <span>{t('Nakrutkalar bilan (QQS bilan)')}: <b>{totals.loading && !lineError ? t('Hisoblanmoqda…') : total.present ? <FmtN val={total.known}/> : t('Noma’lum')}</b></span>
    {total.unknown > 0 && <span className="text-warn">{t('Jami to‘liq emas')}</span>}
    {(totals.failed || lineError) && <span role="status" className="text-warn">{t('Nakrutka hisobi o‘qilmadi. Qayta yangilang.')}<button type="button" className="tugma ml-2" onClick={totals.retry}>{t('Qayta urinish')}</button></span>}
  </section>;
}
