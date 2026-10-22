import { useEffect, useState } from 'react';
import { t } from '../../i18n/til';
import type { EstimateDoc } from '../../lib/smeta-studio/model';
import type { OpenCloudDraft } from './cloud-types';
import { indexEstimate } from '../smeta-studio-pro/hierarchy';
import { calcDoc } from '../../lib/smeta-studio/calc';
import { normDec } from '../../lib/smeta-studio/model';

type Summary={draft_uid:string;nom:string;obyekt:string|null;versiya:number;ish_soni:number;yangilandi:string};
async function read(company:number,action:'royxat'|'ol',draft?:string):Promise<Record<string,unknown>> {
  const response=await fetch('/api/smeta-studio',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({amal:action,kompaniya_id:company,...(draft ? {draft_uid:draft} : {})})});
  const data=await response.json();
  if(!response.ok || data.ok!==true) throw new Error('SERVER_DRAFT_READ_FAILED');
  return data;
}
function documentValid(value:unknown,id:string,company:number):value is EstimateDoc {
  if(!value || typeof value!=='object') return false;
  const d=value as EstimateDoc;
  if(!(d.schema==='smeta-studio-v1' && d.draftId===id && Array.isArray(d.rootOrder) && !!d.sections && typeof d.sections==='object' && !Array.isArray(d.sections) && !!d.occurrences && typeof d.occurrences==='object' && !Array.isArray(d.occurrences) && !!d.context && (d.context.companyId==null || d.context.companyId===company) && Number.isSafeInteger(d.edits) && d.edits>=0 && typeof d.currency==='string'))return false;
  try{
    for(const work of Object.values(d.occurrences)) {
      if(!Array.isArray(work.recipe) || !work.overrides || !work.source || typeof work.source.code!=='string' || !work.basis)return false;
      if(work.quantity!=null)normDec(work.quantity);
      if(work.basis.scale!=null && normDec(work.basis.scale)==='0')return false;
    }
    indexEstimate(d);calcDoc(d);return true;
  }catch{return false;}
}
export function CloudDrafts({company,onOpen,onClose}: {company:number|null;onOpen:OpenCloudDraft;onClose:()=>void}) {
  const [rows,setRows]=useState<Summary[]>([]), [status,setStatus]=useState<'loading'|'ready'|'error'>('loading');
  const [busy,setBusy]=useState(false), [attempt,setAttempt]=useState(0), [search,setSearch]=useState('');
  useEffect(()=>{let active=true;setRows([]);setStatus('loading');if(company==null){setStatus('error');return;}
    read(company,'royxat').then(data=>{if(!active)return;const list=data.qoralamalar;if(!Array.isArray(list))throw new Error();setRows(list.filter((r):r is Summary=>!!r && typeof r.draft_uid==='string' && typeof r.nom==='string' && Number.isSafeInteger(r.versiya) && r.versiya>0));setStatus('ready');}).catch(()=>{if(active)setStatus('error');});return()=>{active=false;};
  },[company,attempt]);
  return <section className="karta space-y-3 p-4" aria-label={t('Serverdagi smetalar')}>
    <div className="flex items-center justify-between"><h2 className="font-semibold">{t('Serverdagi smetalar')}</h2><button className="tugma px-2" disabled={busy} onClick={onClose}>{t('Yopish')}</button></div>
    <input className="input w-full" aria-label={t('Smetani qidirish')} placeholder={t('Smeta yoki obyekt nomi')} value={search} onChange={e=>setSearch(e.target.value)} />
    {status==='loading' && <p role="status">{t('Yuklanmoqda...')}</p>}
    {status==='error' && <div role="alert"><p>{company==null ? t('Avval yuqorida kompaniyani tanlang.') : t('Serverdagi smetalar ochilmadi. Sessiya va ulanishni tekshiring; lokal nusxa saqlanadi.')}</p><button className="tugma px-2" onClick={()=>setAttempt(n=>n+1)}>{t('Qayta urinish')}</button></div>}
    {status==='ready' && !rows.length && <p className="text-text-dim">{t('Bu kompaniyada serverga saqlangan smeta yo‘q.')}</p>}
    <ul className="max-h-96 overflow-auto divide-y divide-border">{rows.filter(r=>`${r.nom} ${r.obyekt ?? ''}`.toLowerCase().includes(search.toLowerCase())).map(r=><li key={r.draft_uid} className="py-3"><button className="text-left font-medium underline disabled:opacity-50" disabled={busy} onClick={async()=>{
      if(company==null || busy)return;setBusy(true);
      try{const result=await read(company,'ol',r.draft_uid);if(!documentValid(result.hujjat,r.draft_uid,company) || !Number.isSafeInteger(result.versiya) || Number(result.versiya)<1)throw new Error();await onOpen(result.hujjat,Number(result.versiya));}catch{setStatus('error');}finally{setBusy(false);}
    }}>{r.nom || t('Nomsiz smeta')}</button><p className="text-xs text-text-dim">{r.obyekt ?? '—'} · {t('{n} ta ish',{n:r.ish_soni})} · {t('Versiya')} {r.versiya} · {new Date(r.yangilandi).toLocaleString()}</p></li>)}</ul>
  </section>;
}
