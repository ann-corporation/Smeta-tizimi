import { t } from '../../i18n/til';
import type { EstimateDoc } from '../../lib/smeta-studio/model';
import type { DocCalc } from '../../lib/smeta-studio/calc';
import { workspaceReview } from '../../lib/smeta-studio/workspace-review';

export function WorkspaceOverview({doc,calculation,onAI,onCatalog,onCalculator,onPrices,onReview,onDocuments}: {
  doc:EstimateDoc;calculation:DocCalc;onAI:()=>void;onCatalog:()=>void;onCalculator:()=>void;onPrices:()=>void;onReview:()=>void;onDocuments:()=>void;
}) {
  const works=Object.values(doc.occurrences),review=workspaceReview(doc,calculation);
  const missingQuantity=works.filter(w=>w.quantity==null).length;
  const missingPrices=Object.values(calculation.occurrences).flatMap(w=>w.lines).filter(l=>l.issues.includes('PRICE_MISSING')).length;
  const amount=!works.length ? '—' : calculation.total.amount ?? calculation.total.knownAmount;
  return <section className="space-y-4" aria-label={t('Smeta ish markazi')}>
    <div className="rounded-2xl border border-accent/25 bg-gradient-to-br from-accent/10 via-surface-1 to-surface-1 p-5 md:p-7">
      <p className="text-xs font-semibold uppercase tracking-widest text-accent">{t('Smeta ish markazi')}</p>
      <h2 className="mt-2 text-2xl font-semibold">{works.length ? doc.context.title || doc.context.objectLabel || t('Joriy smeta') : t('Bugun qanday smeta tayyorlaymiz?')}</h2>
      <p className="mt-2 max-w-2xl text-sm text-text-dim">{t('Topshiriqni oddiy tilda yozing yoki katalogdan ish tanlang. Hajm, koeffitsient va narxlarni shu ish joyida boshqaring.')}</p>
      <div className="mt-5 flex flex-wrap gap-2"><button className="tugma tugma-asosiy px-4 py-2" onClick={onAI}>{t('AI bilan smeta tuzish')}</button><button className="tugma px-4 py-2" onClick={onCatalog}>{t('Katalogdan ish qo‘shish')}</button><button className="tugma px-4 py-2" onClick={onCalculator}>{t('Hajm kalkulyatori')}</button></div>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div className="karta p-4"><p className="text-xs text-text-dim">{!works.length ? t('Smeta qiymati') : calculation.total.amount==null ? t('Ma’lum qism qiymati') : t('Hisoblangan qiymat')}</p><p className="mt-2 text-xl font-semibold tabular-nums">{amount} <span className="text-xs">{doc.currency}</span></p><p className="mt-1 text-xs text-text-dim">{t('Qoralama — tasdiqlanmagan')}</p></div>
      <button className="karta p-4 text-left" onClick={onCalculator}><p className="text-xs text-text-dim">{t('Ishlar va hajmlar')}</p><p className="mt-2 text-xl font-semibold">{works.length}</p><p className={`mt-1 text-xs ${missingQuantity ? 'text-warn' : 'text-text-dim'}`}>{t('Hajmi kiritilmagan')}: {missingQuantity}</p></button>
      <button className="karta p-4 text-left" onClick={onPrices}><p className="text-xs text-text-dim">{t('Narxi aniqlanmagan resurslar')}</p><p className={`mt-2 text-xl font-semibold ${missingPrices ? 'text-warn' : ''}`}>{missingPrices}</p><p className="mt-1 text-xs text-accent">{t('Manbalarni ko‘rish va narxlash')} →</p></button>
      <button className="karta p-4 text-left" onClick={onReview}><p className="text-xs text-text-dim">{t('Tekshirish talab qiladigan ishlar')}</p><p className={`mt-2 text-xl font-semibold ${review.length ? 'text-warn' : ''}`}>{review.length}</p><p className="mt-1 text-xs text-accent">{t('Muammolarni ochish')} →</p></button>
    </div>
    {Boolean(works.length) && <div className="karta flex flex-wrap items-center gap-3 p-4"><div className="flex-1"><p className="font-medium">{t('Keyingi qadam')}</p><p className="text-xs text-text-dim">{missingQuantity ? t('Hajmi kiritilmagan ishlarni to‘ldiring.') : missingPrices ? t('Narxsiz resurslar uchun manba tanlang.') : review.length ? t('Ochiq masalalarni tekshiring.') : t('Hujjat turini tanlang va rekvizitlarni tekshiring.')}</p></div><button className="tugma tugma-asosiy px-3 py-2" onClick={missingQuantity ? onCalculator : missingPrices ? onPrices : review.length ? onReview : onDocuments}>{t('Davom etish')} →</button></div>}
  </section>;
}
