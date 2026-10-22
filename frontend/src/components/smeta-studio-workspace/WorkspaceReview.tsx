import { useEffect, useState } from 'react';
import { t } from '../../i18n/til';
import type { EstimateDoc } from '../../lib/smeta-studio/model';
import type { DocCalc } from '../../lib/smeta-studio/calc';
import { workspaceReview, type ReviewIssue } from '../../lib/smeta-studio/workspace-review';

const labels: Record<ReviewIssue, string> = {
  QUANTITY_MISSING: 'Ish hajmi kiritilmagan', BASIS_UNCONFIRMED: 'Normativ o‘lchov birligi tasdiqlanmagan',
  RESOURCE_UNRESOLVED: 'Resursni tanlash kerak', NORM_UNKNOWN: 'Resurs sarfi aniqlanmagan',
  PRICE_MISSING: 'Narx manbasini tanlash kerak', RECIPE_EMPTY: 'Ishning resurs tarkibi yo‘q',
  COEFFICIENT_PENDING: 'Koeffitsient taklifi qabul qilinmagan',
};
export function WorkspaceReview({ doc, calculation, onWork, onPrices }: {
  doc: EstimateDoc; calculation: DocCalc; onWork: (id: string) => void; onPrices: () => void;
}) {
  const rows = workspaceReview(doc, calculation);
  const [page,setPage]=useState(0);
  useEffect(()=>setPage(0),[doc.draftId,doc.edits]);
  return <section aria-label={t('Smeta tekshiruvi')} className="karta space-y-3 p-3">
    <h2 className="text-sm font-semibold">{t('Smeta tekshiruvi')}</h2>
    <p className="text-xs text-text-dim">{t('Bu tekshiruv hisobdagi yetishmayotgan ma’lumotlarni ko‘rsatadi. Normativning sharoitga mosligini smetachi tasdiqlaydi.')}</p>
    <p className="text-sm tabular-nums">{t('Ma’lum qism')}: {calculation.total.knownAmount} {doc.currency}</p>
    {calculation.total.amount == null && <p className="text-warn">{t('Ma’lumotlar to‘liq emas — yakuniy summa aniqlanmagan.')}</p>}
    {!Object.keys(doc.occurrences).length && <p>{t('Avval smetaga ish qo‘shing.')}</p>}
    {Boolean(Object.keys(doc.occurrences).length) && !rows.length && <p>{t('Hisoblash uchun yetishmayotgan ma’lumot topilmadi.')}</p>}
    {Boolean(rows.length) && <ul className="max-h-[65vh] space-y-2 overflow-auto">{rows.slice(page*100,(page+1)*100).map(row => <li key={row.occurrenceId} className="rounded border border-border p-2 text-xs">
          <p className="font-medium"><span className="font-mono">{row.code}</span> · {row.name}</p>
          <ul className="my-1 list-inside list-disc text-text-dim">{row.issues.map(issue => <li key={issue}>{t(labels[issue])}</li>)}</ul>
          <button type="button" className="tugma h-7 px-2" onClick={() => onWork(row.occurrenceId)}>{t('Ishni ko‘rish')}</button>
          {row.issues.includes('PRICE_MISSING') && <button type="button" className="tugma ml-2 h-7 px-2" onClick={onPrices}>{t('Narxlashga o‘tish')}</button>}
        </li>)}</ul>}
    {Boolean(rows.length) && <div className="flex items-center gap-2 text-xs">
      <button type="button" className="tugma h-7 px-2" disabled={!page} onClick={()=>setPage(p=>p-1)}>{t('Oldingi')}</button>
      <span>{page*100+1}–{Math.min((page+1)*100,rows.length)} / {rows.length}</span>
      <button type="button" className="tugma h-7 px-2" disabled={(page+1)*100 >= rows.length} onClick={()=>setPage(p=>p+1)}>{t('Keyingi')}</button>
    </div>}
  </section>;
}
