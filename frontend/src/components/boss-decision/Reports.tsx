import { useEffect, useRef, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { t } from '../../i18n/til';
import type { BossDashboard } from '../../api/t2-boss';
import { hujjatYuklabOlishUrl } from '../../api/t2-hujjat-canonical';
import {readDocuments} from './documents';
import { completePortfolio, objectUrl, trustedExecutive } from './model';
import { managementWorkbook, readObjectEvidence, type ReportScope } from './report';
import CostEvidence from './CostEvidence';
const input='rounded-xl border border-border bg-surface px-3 py-2 min-w-0';
export default function Reports({data,initialObjectId}:{data:BossDashboard;initialObjectId?:number}) {
  const e=trustedExecutive(data);const [kind,setKind]=useState<ReportScope['kind']>(initialObjectId?'object':'company');
  const [project,setProject]=useState('');const [objectId,setObject]=useState(initialObjectId?String(initialObjectId):'');const [section,setSection]=useState('');
  const [busy,setBusy]=useState(false);const [error,setError]=useState(false);
  const generation=useRef<AbortController|null>(null);
  useEffect(()=>{const controller=new AbortController();generation.current=controller;setError(false);setBusy(false);return ()=>{controller.abort();};},[data.kompaniya.kompaniya_id,data.generated_at,kind,project,objectId,section]);
  const object=e?.objects.find(o=>o.object_id===Number(objectId));
  const scopedObject=(kind==='object'||kind==='section')?object:undefined;
  const projectId=kind==='project'?(project==='none'?null:project?Number(project):undefined):scopedObject?.project_id;
  const validScope=kind==='company'||(kind==='project'?e?.projects.some(p=>String(p.project_id??'none')===project):!!scopedObject);
  const docs=useInfiniteQuery({queryKey:['bossDocuments',data.kompaniya.kompaniya_id,kind,projectId,scopedObject?.object_id],enabled:!!validScope,
    initialPageParam:null as number|null,
    queryFn:({pageParam,signal})=>readDocuments({companyId:data.kompaniya.kompaniya_id,projectId,objectId:scopedObject?.object_id,withoutProject:kind==='project'&&projectId===null},pageParam,signal),
    getNextPageParam:page=>page.next_before_id??undefined,staleTime:30000});
  const documents=docs.data?.pages.flatMap(p=>p.documents)??[];
  const documentTotal=docs.data?.pages[0]?.jami??0;
  const rows=useQuery({queryKey:['bossReportRows',data.kompaniya.kompaniya_id,scopedObject?.object_id],enabled:!!scopedObject,
    queryFn:()=>readObjectEvidence(data.kompaniya.kompaniya_id,scopedObject!.object_id),staleTime:0});
  const sectionExists=rows.data?.rows.some(r=>r.id===Number(section) && r.tur==='rz');
  const canExport=e && completePortfolio(e) && validScope && !busy && (!scopedObject || (!!rows.data&&!rows.isFetching&&!rows.isError)) && (kind!=='section'||sectionExists);
  async function exportReport() {
    if(!canExport || !generation.current) return;const ticket=generation.current;setBusy(true);setError(false);
    const scope:ReportScope=kind==='company'?{kind}:kind==='project'?{kind,id:projectId??null}:kind==='section'?{kind,id:scopedObject!.object_id,sectionId:Number(section)}:{kind:'object',id:scopedObject!.object_id};
    try {const bytes=await managementWorkbook(data,scope,rows.data);if(ticket.signal.aborted)return;const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
      const a=document.createElement('a');a.href=url;a.download=`Management-${data.kompaniya.kompaniya_id}-${scope.kind}-${Date.now()}.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
    } catch {if(!ticket.signal.aborted)setError(true);} finally {if(!ticket.signal.aborted)setBusy(false);}
  }
  return <section id="boss-reports" className="karta p-5 space-y-4 scroll-mt-4">
    <h2 className="font-semibold text-lg">{t('Hujjatlar va boshqaruv hisoboti')}</h2>
    <p className="text-sm text-text-dim">{t('Asl hujjatni yuklab oling yoki tanlangan kesim uchun raqamlar va manbalari bilan alohida hisobot tuzing.')}</p>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="grid gap-1 text-sm">{t('Hisobot darajasi')}<select className={input} value={kind} onChange={ev=>{setKind(ev.target.value as ReportScope['kind']);setError(false);}}>
        <option value="company">{t('Kompaniya')}</option><option value="project">{t('Loyiha')}</option><option value="object">{t('Obyekt')}</option><option value="section">{t('Razdel')}</option></select></label>
      {kind==='project' && <label className="grid gap-1 text-sm">{t('Loyiha')}<select className={input} value={project} onChange={ev=>setProject(ev.target.value)}><option value="">{t('Tanlang')}</option>{e?.projects.map(p=><option key={p.project_id??'none'} value={String(p.project_id??'none')}>{p.name}</option>)}</select></label>}
      {(kind==='object'||kind==='section') && <label className="grid gap-1 text-sm">{t('Obyekt')}<select className={input} value={objectId} onChange={ev=>{setObject(ev.target.value);setSection('');}}><option value="">{t('Tanlang')}</option>{e?.objects.map(o=><option key={o.object_id} value={o.object_id}>{o.name}</option>)}</select></label>}
      {kind==='section' && <label className="grid gap-1 text-sm">{t('Razdel')}<select className={input} value={section} onChange={ev=>setSection(ev.target.value)} disabled={!rows.data||rows.isFetching}><option value="">{t('Tanlang')}</option>{rows.data?.rows.filter(r=>r.tur==='rz').map(r=><option key={r.id} value={r.id}>{`${'· '.repeat(Math.min(r.daraja??0,8))}${r.nom} (#${r.id})`}</option>)}</select></label>}
      <button type="button" className="rounded-xl bg-accent px-4 py-2 text-white disabled:opacity-40 self-end" disabled={!canExport} onClick={()=>void exportReport()}>{busy?t('Tayyorlanmoqda…'):t('Boshqaruv hisobotini yuklash')}</button>
    </div>
    {(!e||!completePortfolio(e)) && <p role="status" className="text-warn text-sm">{t('To‘liq hisobot uchun portfel ma’lumoti yetarli emas. Qisman ma’lumot to‘liq hisobot sifatida berilmaydi.')}</p>}
    {scopedObject && rows.isFetching && <p role="status">{t('Obyekt qatorlari to‘liq o‘qilmoqda…')}</p>}
    {(error||rows.isError) && <p role="alert" className="text-danger">{t('Hisobot tayyorlanmadi. Manbalar to‘liq o‘qilganini tekshirib, qayta urining.')}<button type="button" className="underline ml-2" onClick={()=>void rows.refetch()}>{t('Qayta urinish')}</button></p>}
    <p className="text-xs text-text-dim">{t('Boshqaruv hisoboti tasdiqlangan F2 yoki F3 o‘rnini bosmaydi. Smeta va F2 summalari turli hisob asoslarida bo‘lishi mumkin.')}</p>
    {scopedObject && <div className="flex flex-wrap gap-3 text-sm">
      <Link className="underline" to={objectUrl(scopedObject.object_id,scopedObject.project_id,'f2-tarix')}>{t('F2 tarixi va asl aktlar')}</Link>
      <Link className="underline" to={objectUrl(scopedObject.object_id,scopedObject.project_id,'nakopitelniy')}>{t('Nakopitelniy va F3')}</Link>
      <Link className="underline" to={objectUrl(scopedObject.object_id,scopedObject.project_id)}>{t('LRV va qoldiq hujjatlari')}</Link>
    </div>}
    {scopedObject&&rows.data&&!rows.isFetching&&!rows.isError&&(kind!=='section'||sectionExists)&&<CostEvidence key={`${scopedObject.object_id}-${kind==='section'?section:'all'}`} evidence={rows.data} sectionId={kind==='section'?Number(section):undefined}/>}
    <h3 className="font-semibold">{t('Saqlangan asl hujjatlar')}</h3>
    {kind==='section' && <p className="text-xs text-text-dim">{t('Asl hujjatlar obyekt darajasida ko‘rsatiladi; razdel kesimi boshqaruv hisobotida ajratiladi.')}</p>}
    {docs.isFetching && <p role="status">{t('Hujjatlar yuklanmoqda…')}</p>}
    {docs.isError && <p role="alert" className="text-danger">{t('Hujjatlar ro‘yxati yuklanmadi.')}<button className="ml-2 underline" onClick={()=>void docs.refetch()}>{t('Qayta urinish')}</button></p>}
    {!docs.isError&&docs.data && <><p className="text-xs text-text-dim">{t('Ko‘rsatilgan / jami')}: {documents.length} / {documentTotal}</p>
      {docs.hasNextPage&&<button type="button" disabled={docs.isFetchingNextPage} className="rounded-xl border border-border px-4 py-2 text-sm disabled:opacity-40" onClick={()=>void docs.fetchNextPage()}>{t('Yana hujjatlarni ko‘rsatish')}</button>}
      <ul className="divide-y divide-border max-h-72 overflow-auto">{documents.map(d=><li key={d.id} className="py-2 flex items-center justify-between gap-4 text-sm"><span className="min-w-0 break-words">{d.filename}<span className="text-text-dim text-xs ml-2">{t('Versiya')}: {d.revision}</span></span>{d.canonicalStatus==='READY'&&Number.isSafeInteger(Number(d.id))&&Number(d.id)>0?<a className="shrink-0 underline" href={hujjatYuklabOlishUrl(Number(d.id))} download>{t('Yuklab olish')}</a>:<span className="text-warn">{t('Hali tayyor emas')}</span>}</li>)}</ul>
      {documents.length===0 && <p className="text-sm text-text-dim">{t('Bu kesimda saqlangan hujjat yo‘q. Obyektni tanlab, mavjud hujjat generatorini ochishingiz mumkin.')}</p>}</>}
  </section>;
}
