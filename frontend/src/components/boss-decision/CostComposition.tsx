import { t } from '../../i18n/til';
import { knownShare,type CostComposition as Composition } from './composition';
const money=new Intl.NumberFormat('uz-UZ',{maximumFractionDigits:2});
const percent=new Intl.NumberFormat('uz-UZ',{maximumFractionDigits:1});
function categoryLabel(key:string){
 const labels:Record<string,string>={'МАТ':t('Materiallar'),'ЧЕЛ':t('Ishchi kuchi'),'МАШ':t('Mashina va mexanizmlar'),'ОБ':t('Uskunalar'),'КАБ':t('Kabellar'),'М-К':t('Metall konstruksiyalar'),'UNCLASSIFIED':t('Toifasi ko‘rsatilmagan')};return Object.prototype.hasOwnProperty.call(labels,key)?labels[key]:key;
}
export default function CostComposition({composition,selected,onSelect}:{composition:Composition;selected:string|null;onSelect:(key:string|null)=>void}){
 return <section className="rounded-2xl border border-border bg-surface/70 p-4 space-y-3">
  <div className="flex items-center justify-between gap-3"><h4 className="font-medium">{t('Xarajatlar tarkibi')}</h4>{selected&&<button type="button" className="text-xs text-accent underline" onClick={()=>onSelect(null)}>{t('Barcha toifalar')}</button>}</div>
  <p className="text-xs text-text-dim">{t('Ulush faqat ma’lum to‘g‘ridan-to‘g‘ri summalar ichida hisoblangan. Bu bajarilish foizi emas.')}</p>
  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{composition.groups.map(group=>{const share=knownShare(composition,group);return <button key={group.key} type="button" aria-pressed={selected===group.key} onClick={()=>onSelect(selected===group.key?null:group.key)} className={`rounded-xl border p-3 text-left transition-colors ${selected===group.key?'border-accent bg-accent/10':'border-border hover:border-accent/40'}`}>
   <div className="flex justify-between gap-3 text-sm"><span>{categoryLabel(group.key)}</span><span className="text-text-dim">{share==null?'—':percent.format(share)+'%'}</span></div>
   <p className="text-base font-semibold tabular-nums mt-2">{group.known==null?'—':money.format(group.known)+' UZS'}</p>
   {share!=null&&<div aria-hidden="true" className="h-1.5 mt-3 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-accent/80" style={{width:`${share}%`}}/></div>}
   <p className="text-xs text-text-dim mt-2">{t('Qatorlar')}: {group.rows} · {t('Summasi noma’lum')}: {group.missing} · {t('Narxsiz')}: {group.unpriced}</p>
  </button>;})}</div>
  {composition.negativeRows>0&&<p className="text-xs text-warn">{t('Manfiy tuzatishlar mavjud. Summalar saqlangan, ulush diagrammasi chiqarilmaydi.')}</p>}
  {composition.missing>0&&<p className="text-xs text-warn">{t('Tarkib qisman: summasi noma’lum qatorlar umumiy qiymatga taxminan qo‘shilmagan.')}</p>}
 </section>;
}
