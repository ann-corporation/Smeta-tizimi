import type { Id, ProgressLineResult, ProgressValuationResult } from '../../lib/construction-document-control';
import { t } from '../../i18n/til';

export interface ExportPreviewModel { 
  f2PeriodId: Id; 
  estimateRevisionId: Id; 
  rows: readonly ProgressLineResult[]; 
  totals: ProgressValuationResult['totals']; 
  reconciliation: readonly {lineId:Id;code:string}[]; 
  documents: readonly Id[]; 
  projectName: string;
  objectName: string;
  contractId?: Id; projectionHash?: string;
}

const show = (value: number | null) => value == null ? 'NOANIQ' : value;
const errorLabel: Record<string, string> = { NAKOPITELNIY_MISMATCH: 'Nakopitelniy yig‘indisi mos emas', MISSING_BASELINE_PRICE: 'Boshlang‘ich narx manbasi yo‘q' };

export function ExportPreview({model}:{model:ExportPreviewModel}) {
  return (
    <section aria-label="Excel eksporti oldindan ko‘rish" className="rounded-xl border border-white/10 p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-medium">Hujjatlarni yuklab olish</h2>
        <div className="flex gap-2">
          {/* Egasi 2026-10-02: har chiquvchi hujjat bitta shaklda — asosiy sahifalarda (bu yerdagi ikkinchi generatorlar olib tashlandi). */}
          <a href="/admin/nakopitelniy" className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium transition-colors">{t('Nakopitelniy')}</a>
          <a href="/admin/f2-tarix" className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 rounded text-sm font-medium transition-colors">{t('Forma-2')}</a>
          <button disabled aria-describedby="forma3-holati" className="px-3 py-1 rounded text-sm font-medium bg-slate-700 text-slate-400 cursor-not-allowed">Forma-3</button>
        </div>
      </div>
      <p className="text-sm">Tanlangan davr: tayyor · Smeta manbasi: mavjud</p>
      <p className="text-sm">Jami bajarilgan: {show(model.totals.cumulativeValue)} · Qolgan: {show(model.totals.remainingValue)}</p>
      <p className="text-xs text-slate-400">Biriktirilgan dalillar: {model.documents.length ? `${model.documents.length} ta hujjat` : 'qayd etilmagan'}</p>
      <p id="forma3-holati" className="text-xs text-amber-300">Forma-3: FORMA3_RULE_UNRESOLVED — shartnoma/buxgalteriya qoidasining tasdiqlangan dalili ulanmaguncha rasmiy qiymat hujjati yaratilmaydi.</p>
      {model.reconciliation.length>0&&<p role="alert" className="text-red-300">Tekshiruvda {model.reconciliation.length} ta nomuvofiqlik bor: {model.reconciliation.map(x=>errorLabel[x.code] ?? 'Qator ma’lumoti mos emas').join(', ')}</p>}
    </section>
  );
}
export function ExportValidationSummary({errors}:{errors:readonly {lineId:Id;code:string}[]}){return <p className={errors.length?'text-red-300':'text-emerald-300'}>{errors.length?`${errors.length} ta eksport tekshiruvi talab qiladi`:'Eksport hisob-kitobi mos'}</p>}
export function ReconciliationErrors({errors}:{errors:readonly {lineId:Id;code:string}[]}){return <ul aria-label="Eksport nomuvofiqliklari">{errors.map(x=><li key={`${x.lineId}:${x.code}`}>{errorLabel[x.code] ?? 'Qator ma’lumoti mos emas'}</li>)}</ul>}
