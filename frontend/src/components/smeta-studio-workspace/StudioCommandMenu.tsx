import { useEffect, useMemo, useRef, useState } from 'react';
import type { EstimateDoc } from '../../lib/smeta-studio/model';
import { indexEstimate } from '../smeta-studio-pro/hierarchy';
import { t } from '../../i18n/til';

export type DeskAction='catalog'|'coefficients'|'resources'|'ai'|'calculator'|'review'|'save';
export function StudioCommandMenu({doc,onWork,onAction,onClose}:{doc:EstimateDoc;onWork:(id:string)=>void;onAction:(action:DeskAction)=>void;onClose:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null),input=useRef<HTMLInputElement>(null);
  const [query,setQuery]=useState(''),[index,setIndex]=useState(0);
  const works=useMemo(()=>indexEstimate(doc).rows.filter(r=>r.kind==='work'),[doc]);
  const actions: {id:DeskAction;label:string}[]=[{id:'catalog',label:t('Katalogdan ish qo‘shish')},{id:'coefficients',label:t('Tanlangan ish koeffitsientlari')},{id:'resources',label:t('Tanlangan ish resurslari')},{id:'ai',label:t('Smetachi AI bilan ishlash')},{id:'calculator',label:t('Hajm kalkulyatori')},{id:'review',label:t('Smetani tekshirish')},{id:'save',label:t('Serverga saqlash')}];
  const q=query.trim().toLocaleLowerCase();
  const options=[...actions.filter(a=>a.label.toLocaleLowerCase().includes(q)).map(a=>({key:a.id,label:a.label,kind:t('Amal'),run:()=>onAction(a.id)})),...works.filter(w=>`${w.code} ${w.label}`.toLocaleLowerCase().includes(q)).slice(0,40).map(w=>({key:w.key,label:`${w.code} · ${w.label}`,kind:t('Ish'),run:()=>onWork(w.occurrenceId!)}))];
  useEffect(()=>{const previous=document.activeElement;dialog.current?.showModal?.();input.current?.focus();return()=>{if(previous instanceof HTMLElement)previous.focus();};},[]);
  useEffect(()=>{dialog.current?.querySelector('.is-active')?.scrollIntoView?.({block:'nearest'});},[index,query]);
  function choose(i:number){if(!options[i])return;options[i].run();onClose();}
  return <dialog ref={dialog} className="studio-command-dialog" aria-label={t('Tez amallar va ishlar')} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===dialog.current)onClose();}} onKeyDown={e=>{if(e.target===input.current && e.key==='ArrowDown'){e.preventDefault();setIndex(i=>Math.max(0,Math.min(i+1,options.length-1)));}if(e.target===input.current && e.key==='ArrowUp'){e.preventDefault();setIndex(i=>Math.max(0,i-1));}if(e.target===input.current && e.key==='Enter'){e.preventDefault();choose(index);}if(e.key==='Escape'){e.preventDefault();onClose();}}}>
    <div className="studio-command-search"><span aria-hidden="true">⌕</span><input ref={input} aria-label={t('Amal yoki ish qidirish')} placeholder={t('Ish shifri, nomi yoki amalni yozing…')} value={query} onChange={e=>{setQuery(e.target.value);setIndex(0);}}/><button type="button" onClick={onClose} aria-label={t('Yopish')}>{t('Esc')}</button></div>
    <div className="studio-command-results">{options.map((o,i)=><button type="button" key={o.key} className={i===index ? 'is-active' : ''} onMouseEnter={()=>setIndex(i)} onClick={()=>choose(i)}><span>{o.label}</span><small>{o.kind}</small></button>)}{!options.length && <p className="studio-empty">{t('Hech narsa topilmadi.')}</p>}</div>
    <footer>↑ ↓ {t('tanlash')} <span>↵ {t('ochish')}</span><span>Esc {t('yopish')}</span></footer>
  </dialog>;
}
