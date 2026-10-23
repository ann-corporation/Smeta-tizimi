import type { T2Obyekt } from '../../api/supabase';
import type { Liniya } from '../../api/t2-shartnoma-liniya';
import { FmtN } from '../../lib/format';
import { t } from '../../i18n/til';
import { useMarkupTotals } from './useMarkupTotals';

/**
 * Umumiy «Ustama bilan (QQS bilan)» summa. Hisob — mavjud useMarkupTotals
 * (t2ObyektNakrutka + obyekt podvali); bu yerda yangi hisob yo'q.
 * Shrift o'qiladigan (text-sm), tabular-nums. Narxsiz resurs bo'lsa — halol ogohlantirish.
 */
export function UstamaJami({companyId,line,objects,ids,contractId,label}:{
  companyId: number; line: Liniya | null | undefined; objects: T2Obyekt[]; ids: readonly number[]; contractId?: number; label?: string;
}) {
  const totals=useMarkupTotals(companyId,line??undefined,objects);
  const total=totals.sum(ids,contractId);
  return <span className="text-sm tabular-nums">
    <span className="text-text-dim">{label ?? t('Ustama bilan (QQS bilan)')}: </span>
    <b className="text-text">{totals.loading ? t('Hisoblanmoqda…') : total.present ? <FmtN val={total.known}/> : t('Noma’lum')}</b>
    {!totals.loading && total.unknown > 0 && <span className="ml-2 text-text-mute">{t('narxsiz resurslar kirmagan')}</span>}
    {totals.failed && <button type="button" className="tugma ml-2" onClick={totals.retry}>{t('Qayta urinish')}</button>}
  </span>;
}
