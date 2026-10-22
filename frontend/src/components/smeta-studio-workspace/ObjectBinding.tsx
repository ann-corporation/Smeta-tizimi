import { useEffect, useState } from 'react';
import { sbT2ObyektlarOlKomp, type T2Obyekt } from '../../api/supabase';
import { t } from '../../i18n/til';
import type { EstimateDoc } from '../../lib/smeta-studio/model';
import type { StudioCommand } from '../../lib/smeta-studio/commands';

export function ObjectBinding({doc,company,command}: {doc:EstimateDoc;company:number|null;command:(c:StudioCommand)=>boolean}) {
  const [objects,setObjects]=useState<T2Obyekt[]>([]),[status,setStatus]=useState<'loading'|'ready'|'error'>('loading'),[retry,setRetry]=useState(0);
  const foreign=doc.context.companyId!=null && doc.context.companyId!==company;
  useEffect(()=>{let active=true;setObjects([]);if(company==null || foreign){setStatus('ready');return;}setStatus('loading');sbT2ObyektlarOlKomp(company).then(result=>{if(!active)return;if(!result.ok || !Array.isArray(result.qatorlar)){setStatus('error');return;}setObjects(result.qatorlar.filter(o=>o.kompaniya_id===company));setStatus('ready');}).catch(()=>{if(active)setStatus('error');});return()=>{active=false;};},[company,foreign,retry]);
  return <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface-1 p-3 text-xs">
    <label className="flex items-center gap-2">{t('Bog‘langan obyekt')}<select className="input max-w-80" aria-label={t('Bog‘langan obyekt')} value={doc.context.objectId ?? ''} disabled={!company || foreign || status!=='ready'} onChange={e=>{
      if(!company || foreign)return;const object=objects.find(o=>o.id===Number(e.target.value));
      if(e.target.value && !object)return;
      command({type:'SET_CONTEXT',context:{companyId:company,projectId:object?.loyiha_id ?? null,objectId:object?.id ?? null,...(object ? {objectLabel:object.nom} : {})}});
    }}><option value="">{t('Mustaqil smeta — obyekt tanlanmagan')}</option>{doc.context.objectId && !objects.some(o=>o.id===doc.context.objectId) && <option value={doc.context.objectId}>{doc.context.objectLabel || doc.context.objectId}</option>}{objects.map(o=><option key={o.id} value={o.id}>{o.nom}</option>)}</select></label>
    {status==='loading' && <span role="status">{t('Yuklanmoqda...')}</span>}
    {status==='error' && <button className="text-danger underline" onClick={()=>setRetry(n=>n+1)}>{t('Obyektlar ochilmadi — qayta urinish')}</button>}
    {foreign && <span role="alert" className="text-warn">{t('Bu qoralama boshqa kompaniyaga bog‘langan. Avval o‘sha kompaniyani tanlang.')}</span>}
  </div>;
}
