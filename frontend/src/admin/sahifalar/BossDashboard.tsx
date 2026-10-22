import { useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, ArrowUpRight, AlertTriangle } from 'lucide-react';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { KompaniyaKerak } from '../../umumiy/kontekst/KompaniyaKerak';
import { Skelet } from '../../umumiy/ui/Sahifa';
import { useBossDashboard } from '../../api/t2-boss';
import { t } from '../../i18n/til';
import { amount, filteredObjects, objectUrl, projectUrl, signalUrl, sortedSignals, trustedExecutive } from '../../components/boss-decision/model';
import Reports from '../../components/boss-decision/Reports';
import ExecutiveCockpit from '../../components/boss-decision/ExecutiveCockpit';
const nf=new Intl.NumberFormat('uz-UZ',{maximumFractionDigits:2});
const money=(value:unknown)=>{const n=amount(value);return n==null?'—':nf.format(n)+' UZS';};
function Metric({label,value,note}:{label:string;value:string;note?:string}) {
  return <div className="karta p-5 md:p-6 min-w-0 rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-transparent"><p className="text-sm text-text-dim">{label}</p><p className="mt-2 text-xl xl:text-2xl font-semibold tracking-tight tabular-nums break-words">{value}</p>{note&&<p className="mt-2 text-xs text-text-dim">{note}</p>}</div>;
}
export default function BossDashboard() {
  const {joriy}=useKompaniya();const q=useBossDashboard(joriy?.id);
  if(!joriy?.id) return <KompaniyaKerak nima={t('Rahbar paneli')}/>;
  const data=q.data?.kompaniya.kompaniya_id===joriy.id?q.data:undefined;
  return <main className="os-workbench overflow-auto p-4 md:p-7 space-y-5 text-text max-w-[1680px] mx-auto w-full">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm text-text-dim">{joriy.nom}</p><h1 className="text-2xl font-semibold mt-1">{t('Rahbar paneli')}</h1><p className="text-sm text-text-dim mt-2">{t('Holat, e’tibor talab qiladigan ishlar va ularning asoslari.')}</p></div>
      <button type="button" onClick={()=>void q.refetch()} className="rounded-xl border border-border bg-surface px-4 py-2 flex items-center gap-2" disabled={q.isFetching}><RefreshCw size={16} className={q.isFetching?'animate-spin':''}/>{t('Yangilash')}</button></header>
    {q.isLoading&&<Skelet qatorlar={6}/>}
    {q.isError&&<div role="alert" className="karta p-4 text-danger">{t('Rahbar paneli yuklanmadi. Qayta urinib ko‘ring.')}<button className="underline ml-3" onClick={()=>void q.refetch()}>{t('Qayta urinish')}</button></div>}
    {data&&!q.isError&&<Portfolio key={joriy.id} data={data}/>}
  </main>;
}
function Portfolio({data}:{data:NonNullable<ReturnType<typeof useBossDashboard>['data']>}) {
  const e=trustedExecutive(data);const [project,setProject]=useState('all');const [search,setSearch]=useState('');const [issues,setIssues]=useState(false);const [reports,setReports]=useState(false);const [reportObject,setReportObject]=useState<number|undefined>();const [reportProject,setReportProject]=useState<number|null|undefined>();
  const objects=e?filteredObjects(e.objects,project,search,issues):[];
  const signals=sortedSignals(data.signal.royxat);
  const signalLabels:Record<string,string>={document_missing:t('Majburiy hujjat qayd etilmagan'),missing_price:t('Narx asosi yetishmaydi'),data_quality:t('Smeta ma’lumotini tekshirish kerak')};
  const signalRecords=signals.reduce((n,s)=>n+(s.quantity??1),0);
  return <>
    <div className="karta rounded-2xl border border-accent/20 bg-gradient-to-r from-accent/10 to-transparent px-5 py-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm"><strong>{data.kompaniya.loyiha_soni}</strong> {t('loyiha')} · <strong>{data.kompaniya.obyekt_soni}</strong> {t('obyekt')}<span className="text-text-dim ml-3">{t('Ma’lumot vaqti')}: {Number.isFinite(Date.parse(data.generated_at))?new Date(data.generated_at).toLocaleString():'—'}</span></p><button className="bg-accent text-white rounded-xl px-4 py-2 text-sm" aria-expanded={reports} onClick={()=>{setReportObject(undefined);setReportProject(undefined);setReports(!reports);}}>{t('Hujjatlar va hisobot')}</button></div>
    {reports&&<Reports key={`${reportObject??'company'}-${reportProject===undefined?'company':reportProject===null?'unassigned':reportProject}`} data={data} initialObjectId={reportObject} initialProjectId={reportProject}/>}
    <ExecutiveCockpit data={data} onReports={(id,pid)=>{setReportObject(id);setReportProject(pid);setReports(true);requestAnimationFrame(()=>document.getElementById('boss-reports')?.scrollIntoView({behavior:'smooth',block:'start'}));}}/>
    <details className="karta p-5 space-y-5"><summary className="cursor-pointer font-semibold">{t('Portfelning batafsil raqamlari va obyektlar jadvali')}</summary>
    {!e&&<div role="status" className="karta p-5 text-warn">{t('Tasdiqlangan F2 va obyektlar bo‘yicha yangi hisob modeli hali ulanmagan. Eski umumiy akt summasi bajarilgan ish sifatida ko‘rsatilmaydi.')}</div>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label={t('Smeta: ma’lum to‘g‘ridan-to‘g‘ri xarajat')} value={money(e?.totals.estimate_known)} note={e?`${t('Narxsiz qatorlar')}: ${e.totals.unpriced_rows} · ${t('Smetasi yetishmagan obyektlar')}: ${e.totals.estimate_missing}`:t('Ma’lumot yetarli emas')}/>
      <Metric label={t('Tasdiqlangan F2 hujjatlari summasi')} value={money(e?.totals.approved_known)} note={e?`${t('Aktlar')}: ${e.totals.approved_count} · ${t('Summasi noma’lum')}: ${e.totals.approved_missing}`:t('Ma’lumot yetarli emas')}/>
      <Metric label={t('F2: tekshiruv / qoralama')} value={e?`${e.totals.review_count} / ${e.totals.draft_count}`:'—'} note={t('Tasdiqlangan aktlardan alohida')}/>
      <Metric label={t('Muhim ochiq signallar')} value={String(data.signal.kritik_soni)} note={`${t('Jami ochiq')}: ${data.signal.ochiq_soni}`}/>
    </div>
    <p className="text-xs text-text-dim">{t('Summalar hisob asosi bilan ko‘rsatilgan. Smeta va F2 nisbatidan jismoniy bajarilish foizi chiqarilmaydi. Narxsiz qatorlar bo‘lsa, summa qisman.')}</p>
    {e&&<section className="karta p-5 space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">{t('Loyihalar va obyektlar')}</h2><div className="flex flex-wrap gap-2"><select aria-label={t('Loyiha')} value={project} onChange={ev=>setProject(ev.target.value)} className="bg-surface border border-border rounded-xl px-3 py-2"><option value="all">{t('Barcha loyihalar')}</option>{e.projects.map(p=><option value={String(p.project_id??'none')} key={p.project_id??'none'}>{p.name}</option>)}</select><input className="bg-surface border border-border rounded-xl px-3 py-2" value={search} onChange={ev=>setSearch(ev.target.value)} aria-label={t('Obyektni qidirish')} placeholder={t('Obyektni qidirish')}/></div></div>
      <div className="grid gap-3 md:grid-cols-3">{e.projects.map(p=><Link className="rounded-xl border border-border p-3 hover:bg-accent/10" to={projectUrl(p.project_id)} key={p.project_id??'none'}><div className="font-medium">{p.name}</div><div className="text-sm text-text-dim mt-1">{p.object_count} {t('obyekt')} · {money(p.estimate_known)}</div></Link>)}</div>
      <label className="flex gap-2 items-center text-sm"><input type="checkbox" checked={issues} onChange={ev=>setIssues(ev.target.checked)}/>{t('Faqat e’tibor talab qiladigan obyektlar')}</label>
      <div className="overflow-x-auto"><table className="w-full text-sm min-w-[760px]"><thead className="text-left text-text-dim"><tr><th className="py-3">{t('Obyekt')}</th><th className="text-right">{t('Smeta, nakrutkasiz')}</th><th className="text-right">{t('Tasdiqlangan F2')}</th><th className="pl-5">{t('E’tibor talab qiladi')}</th></tr></thead><tbody>{objects.map(o=><tr className="border-t border-border" key={o.object_id}><td className="py-4 max-w-64 pr-4"><Link className="font-medium hover:underline inline-flex gap-2 items-center" to={objectUrl(o.object_id,o.project_id)}>{o.name}<ArrowUpRight size={14}/></Link><p className="text-xs text-text-dim mt-1">{o.project_name??t('Loyihaga biriktirilmagan')}</p></td><td className="text-right tabular-nums"><a href="#boss-reports" className="hover:text-accent underline decoration-dotted underline-offset-4" aria-label={`${t('Summaning asosini ko‘rish')}: ${o.name}`} onClick={()=>{setReportObject(o.object_id);setReportProject(undefined);setReports(true);}}>{money(o.estimate_known)}</a></td><td className="text-right tabular-nums"><Link className="hover:text-accent underline decoration-dotted underline-offset-4" to={objectUrl(o.object_id,o.project_id,'f2-tarix')}>{money(o.approved_known)}</Link></td><td className="pl-5 text-xs space-y-1 py-3">
        {o.unpriced_rows>0&&<p className="text-warn">{t('Narxsiz qatorlar')}: {o.unpriced_rows}</p>}{o.estimate_missing>0&&<p className="text-warn">{t('Smeta yetishmaydi')}</p>}{o.approved_missing>0&&<p className="text-danger">{t('F2 summasi noma’lum')}: {o.approved_missing}</p>}{o.review_count>0&&<p>{t('Tekshiruvdagi F2')}: {o.review_count}</p>}{o.draft_count>0&&<p>{t('F2 qoralamalari')}: {o.draft_count}</p>}{o.pending_changes>0&&<p>{t('Smeta o‘zgarishi qoralamalari')}: {o.pending_changes}</p>}</td></tr>)}</tbody></table></div>
      {objects.length===0&&<p role="status" className="text-text-dim">{t('Tanlangan filtrga mos obyekt yo‘q.')}</p>}
      <p className="text-xs text-text-dim">{t('Ko‘rsatilgan / jami')}: {objects.length} / {e.totals.object_count}. {t('Qidiruv umumiy summalarni o‘zgartirmaydi.')}</p>
      {e.objects.length<e.totals.object_count&&<p className="text-warn">{t('Ro‘yxat chegaralangan. Kerakli obyektni tanlab, qidiruvni toraytiring.')}</p>}
    </section>}
    <div className="grid gap-4 lg:grid-cols-2"><section className="karta p-5"><h2 className="font-semibold text-lg flex items-center gap-2"><AlertTriangle size={18}/>{t('Tekshirish kerak')}</h2><ul className="divide-y divide-border mt-3">{signals.map(s=><li key={s.id} className="py-3"><Link className="hover:underline text-sm" to={signalUrl(s,e?.objects??[])}>{signalLabels[s.signal_type??'']??s.title??t('Ochiq signal')}</Link><p className="text-xs text-text-dim mt-1">{e?.objects.find(o=>String(o.object_id)===String(s.entity_id))?.name??t('Kompaniya yozuvi')} · {s.quantity??1} {t('qayd')} · {s.detected_at&&Number.isFinite(Date.parse(s.detected_at))?new Date(s.detected_at).toLocaleDateString():'—'}</p></li>)}</ul>{signals.length===0&&<p className="text-sm text-text-dim mt-3">{t('Ochiq signal qayd etilmagan. Bu barcha tekshiruvlar o‘tganini anglatmaydi.')}</p>}{data.signal.ochiq_soni>signalRecords&&<p className="text-xs text-text-dim">{t('Ko‘rsatilgan / jami')}: {signalRecords} / {data.signal.ochiq_soni}</p>}</section>
      <section className="karta p-5 space-y-3"><h2 className="font-semibold text-lg">{t('Kompaniya bo‘yicha qayd etilgan moliya')}</h2><p className="text-xs text-text-dim">{t('Buxgalteriya yozuvlari. Bu loyiha foydasi yoki bank qoldig‘i emas.')}</p><dl className="space-y-3 text-sm">{[[t('Qayd etilgan to‘lovlar'),data.moliya.jami_tolangan],[t('Qayd etilgan xarajatlar'),data.moliya.jami_xarajat],[t('Hisob bo‘yicha debitorlik'),data.moliya.jami_debitor]].map(([label,value])=><div className="flex justify-between gap-4" key={String(label)}><dt className="text-text-dim">{label}</dt><dd className="tabular-nums">{money(data.moliya.ulangan?value:null)}</dd></div>)}</dl><Link className="text-sm underline inline-block" to="/admin/moliya">{t('Buxgalteriya asoslarini ochish')}</Link>{e&&<p className="text-xs text-text-dim">{t('To‘lov / xarajat yozuvlari')}: {e.payment_count} / {e.expense_count}</p>}</section></div>
    <details className="karta p-5 text-sm"><summary className="cursor-pointer font-medium">{t('Hisob asoslari va yetishmayotgan ma’lumotlar')}</summary><p className="text-text-dim mt-3">{t('Portfel faqat faol obyektlarni qamraydi. Tasdiqlanmagan F2 va fakt yozuvlari tasdiqlangan F2 summasiga kirmaydi. Noma’lum qiymat nol bilan almashtirilmaydi.')}</p>{e&&<p className="text-text-dim mt-2">{t('Summasi noma’lum faol shartnomalar')}: {e.contracts_missing}</p>}</details>
    </details>
  </>;
}
