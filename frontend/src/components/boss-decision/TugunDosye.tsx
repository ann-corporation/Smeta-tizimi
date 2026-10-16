import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Link} from 'react-router-dom';
import {bossDashboardOl,type BossDashboard} from '../../api/t2-boss';
import type {MindmapGraf,MindmapTugun} from '../../api/t2-mindmap';
import {t} from '../../i18n/til';
import {entityLabels,knownSum,scopedObjects} from './cockpit-data';
import {amount,objectUrl,trustedExecutive,type PortfolioTotals} from './model';
import {compactMoney,moneyProportion,paymentEvidence} from './decision-v2';

type Props={tugun:MindmapTugun;graf:MindmapGraf;kompaniyaId:number;data?:BossDashboard;onReports?:()=>void};
type Figure={key:string;label:string;value:number;formula:string;source:string;missing:number};
const exact=(v:number)=>new Intl.NumberFormat('uz-UZ',{minimumFractionDigits:2,maximumFractionDigits:2}).format(v)+' UZS';

/** The one dossier used by the existing Mindmap and executive cockpit. Graph money is never a ledger. */
export default function TugunDosye({tugun,graf,kompaniyaId,data,onReports}:Props) {
  const [opened,setOpened]=useState<string|null>(null);
  const companyValid=Number.isSafeInteger(kompaniyaId)&&kompaniyaId>0;
  const identityValid=companyValid&&graf.tugunlar.some(n=>n.id===`kompaniya:${kompaniyaId}`&&n.tur==='kompaniya')
    &&!graf.tugunlar.some(n=>n.tur==='kompaniya'&&n.id!==`kompaniya:${kompaniyaId}`)
    &&graf.tugunlar.some(n=>n.id===tugun.id&&n.tur===tugun.tur);
  const query=useQuery({queryKey:['bossDashboard',kompaniyaId],queryFn:({signal})=>bossDashboardOl(kompaniyaId,signal),
    enabled:identityValid&&!data,staleTime:60_000,retry:1});
  // A failed refresh must not expose previously cached amounts as current evidence.
  const source=data??(query.isError?undefined:query.data);
  if(!identityValid||source&&source.kompaniya.kompaniya_id!==kompaniyaId)return <p role="alert">{t('Tanlangan tugun joriy kompaniya ma’lumotida topilmadi. Kompaniya darajasiga qayting.')}</p>;
  const executive=source?trustedExecutive(source):null;
  const objects=scopedObjects(executive,graf,tugun.id);
  const object=executive?.objects.find(o=>`obyekt:${o.object_id}`===tugun.id);
  const project=executive?.projects.find(p=>p.project_id!==null&&`loyiha:${p.project_id}`===tugun.id);
  const company=tugun.tur==='kompaniya';
  const totals:PortfolioTotals|undefined=company?executive?.totals:object??project;
  const figures:Figure[]=[];
  const add=(key:string,label:string,value:unknown,formula:string,sourceName:string,missing=0)=>{
    const v=amount(value);if(v!==null)figures.push({key,label,value:v,formula,source:sourceName,missing});
  };
  // For contracts these are explicitly linked objects, not an allocated contract share.
  const completeObjectScope=!!executive&&executive.objects.length===executive.totals.object_count;
  const linkedEstimate=knownSum(objects.map(o=>o.estimate_known));
  const linkedApproved=knownSum(objects.map(o=>o.approved_known));
  const estimate=totals?.estimate_known??(totals?null:linkedEstimate.known);
  const approved=totals?.approved_known??(totals?null:linkedApproved.known);
  const estimateMissing=totals?totals.estimate_missing+totals.unpriced_rows:linkedEstimate.missing+objects.reduce((s,o)=>s+o.unpriced_rows,0);
  const approvedMissing=totals?.approved_missing??objects.reduce((s,o)=>s+o.approved_missing,0);
  add('estimate','Smeta, nakrutkasiz',estimate,'Σ t2_obyekt_jami.jami','t2_obyekt_jami',estimateMissing);
  add('approved','Tasdiqlangan F2',approved,"Σ t2_akt.hujjat_jami; tur=f2; holat=tasdiqlangan/yakunlangan; lifecycle=approved (legacy NULL)",'t2_akt',approvedMissing);
  const payment=paymentEvidence(source?.moliya.ulangan?source.moliya.jami_tolangan:null,executive?.payment_count??null);
  if(company&&payment.state==='recorded')add('paid','Qayd etilgan to‘lovlar',payment.amount,'Σ qayd etilgan to‘lovlar','t2_bux_umumiy');
  const selected=figures.find(f=>`${tugun.id}:${f.key}`===opened);
  const proportion=estimateMissing===0&&approvedMissing===0&&(!!totals||completeObjectScope)?moneyProportion(approved,estimate):null;
  return <section aria-label={t('Tanlangan joyning izohi')} className="rounded-2xl border border-border bg-surface/80 p-4 space-y-4 min-w-0">
    <div className="flex flex-wrap justify-between gap-2"><div><h3 className="font-semibold">{t('Tanlangan joyning izohi')}</h3><p className="text-xs text-text-dim mt-1">{t(entityLabels[tugun.tur])} · {tugun.nom}</p></div><Link className="text-xs underline" to={`/admin/mindmap?tugun=${encodeURIComponent(tugun.id)}`}>{t('To‘liq mindmapda ochish')}</Link></div>
    {!source&&query.isPending&&<p role="status" className="text-sm">{t('Ma’lumotlar yuklanmoqda…')}</p>}
    {!data&&query.isError&&<div role="alert" className="text-sm"><p>{t('Ma’lumot yuklanmadi. Noma’lum qiymat nol deb olinmaydi.')}</p><button type="button" className="underline mt-2" onClick={()=>void query.refetch()}>{t('Qayta urinish')}</button></div>}
    {figures.length>0&&<div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-2">{figures.map(f=><button type="button" key={f.key} aria-label={`${t(f.label)} ${compactMoney(f.value)}`} aria-expanded={selected?.key===f.key} className="rounded-xl border border-border p-3 text-left hover:border-accent focus-visible:outline-2 focus-visible:outline-accent" onClick={()=>setOpened(selected?.key===f.key?null:`${tugun.id}:${f.key}`)}><span className="text-xs text-text-dim block">{t(f.label)}</span><span className="font-semibold tabular-nums block mt-1">{compactMoney(f.value)}</span>{f.missing>0&&<span className="text-xs text-warn">{t('Summa qisman')} · {f.missing}</span>}</button>)}</div>}
    {selected&&<div className="rounded-xl border border-accent/30 bg-accent/5 p-3 space-y-2 text-xs" role="region" aria-label={t('Summaning asosini ko‘rish')}><p className="font-semibold text-base tabular-nums">{exact(selected.value)}</p><p>{t('Hisob asosi')}: {selected.formula}</p><p>{t('Manba')}: {selected.source}</p><time dateTime={source!.generated_at}>{source!.generated_at}</time>{selected.missing>0&&<p className="text-warn">{t('Summa qisman')} · {selected.missing}</p>}</div>}
    {company&&executive&&payment.state==='not-entered'&&<p className="text-xs text-warn">{t('To‘lovlar tizimga kiritilmagan. Qarz tasdiqlanmagan.')}</p>}
    {proportion!==null&&<p className="text-xs text-text-dim">{t('F2 / smeta, pul bo‘yicha')}: {new Intl.NumberFormat('uz-UZ',{maximumFractionDigits:1}).format(proportion)}% · {t('Hisob asoslari farq qilishi mumkin')}</p>}
    {tugun.tur==='shartnoma'&&objects.length>0&&<p className="text-xs text-text-dim">{t('Bog‘langan smetali obyektlar')}: {objects.length}. {t('Umumiy shartnoma obyektlarga avtomatik taqsimlanmaydi.')}</p>}
    {executive&&!completeObjectScope&&<p className="text-xs text-warn">{t('Ro‘yxat chegaralangan. Kerakli obyektni tanlab, qidiruvni toraytiring.')}</p>}
    {source&&!executive&&<p className="text-xs text-text-dim">{t('Summalar hali yuklanmagan. Asl hujjatlarni ochish mumkin.')}</p>}
    <div className="flex flex-wrap gap-3 text-xs">{object&&<><Link className="underline" to={objectUrl(object.object_id,object.project_id)}>{t('Smeta va razdellarni ochish')}</Link><Link className="underline" to={objectUrl(object.object_id,object.project_id,'f2-tarix')}>{t('F2 tarixini ochish')}</Link></>}{onReports&&<button type="button" className="underline" onClick={onReports}>{t('Hujjat va hisob asoslari')}</button>}</div>
  </section>;
}
