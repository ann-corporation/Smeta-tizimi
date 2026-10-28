import { useEffect,useId,useRef,useState } from 'react';
import { ChevronDown,Check,X,Search } from 'lucide-react';
import { t } from '../../i18n/til';
import { qidiruvKaliti } from '../../i18n/lotin-kirill';
import './ombor-tanlov.css';
export function OmborTanlov({label,value,options,onChange,disabled=false}:{label:string;value:string;options:readonly {value:string;label:string}[];onChange:(v:string)=>void;disabled?:boolean}){
 const [open,setOpen]=useState(false);const [query,setQuery]=useState('');const id=useId();const ref=useRef<HTMLInputElement>(null);const triggerRef=useRef<HTMLButtonElement>(null);const panelRef=useRef<HTMLElement>(null);
 useEffect(()=>{if(!open)return;const trigger=triggerRef.current;ref.current?.focus();const close=(e:KeyboardEvent)=>{
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setOpen(false);}
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){const options=Array.from(panelRef.current?.querySelectorAll<HTMLElement>('[role="option"]')??[]);if(options.length){e.preventDefault();const i=options.indexOf(document.activeElement as HTMLElement);options[(i+(e.key==='ArrowDown'?1:-1)+options.length)%options.length]?.focus();}}
  if(e.key==='Tab'){const nodes=Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)')??[]);const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
 };window.addEventListener('keydown',close,true);return()=>{window.removeEventListener('keydown',close,true);trigger?.focus();};},[open]);
 const selected=options.find(o=>o.value===value);const list=options.filter(o=>qidiruvKaliti(o.label).includes(qidiruvKaliti(query)));
 return <div className="min-w-0"><button ref={triggerRef} type="button" role="combobox" aria-label={label} aria-expanded={open} aria-controls={open?id:undefined} aria-haspopup="listbox" disabled={disabled}
   className="flex min-h-[48px] w-full items-center justify-between gap-3 rounded-lg border border-border bg-[var(--surface)] px-3 text-left text-[13px] text-text disabled:opacity-50" onKeyDown={e=>{if(e.key==='ArrowDown'){e.preventDefault();setQuery('');setOpen(true);}}} onClick={()=>{setQuery('');setOpen(true);}}><span className="truncate">{selected?.label||t('Tanlang')}</span><ChevronDown size={16}/></button>
  {open&&<div className="fixed inset-0 z-[150] flex items-end justify-center bg-black/60 sm:items-center sm:p-4" onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false);}}>
    <section ref={panelRef} role="dialog" aria-modal="true" aria-label={label} className="ombor-tanlov-panel flex max-h-[85dvh] w-full max-w-lg flex-col rounded-t-2xl border border-border bg-[var(--surface)] p-4 shadow-xl sm:rounded-2xl">
      <header className="mb-3 flex items-center justify-between gap-3"><h3 className="m-0 text-[16px] font-semibold">{label}</h3><button type="button" aria-label={t('Yopish')} className="grid h-[48px] w-[48px] place-items-center rounded-lg border border-border" onClick={()=>setOpen(false)}><X size={18}/></button></header>
      <label className="mb-3 flex min-h-[48px] items-center gap-2 rounded-lg border border-border bg-bg px-3"><Search size={17}/><input ref={ref} aria-label={t('Variantlarni qidirish')} placeholder={t('Yozing yoki variantni bosing')} value={query} onChange={e=>setQuery(e.target.value)} className="min-h-[48px] min-w-0 flex-1 bg-transparent text-[14px] text-text outline-none"/></label>
      <div role="listbox" id={id} aria-label={label} className="space-y-2 overflow-y-auto">
        {list.map(o=><button type="button" role="option" aria-selected={o.value===value} key={o.value} className={`flex min-h-[56px] w-full items-center justify-between gap-3 rounded-xl border p-3 text-left text-[14px] ${o.value===value?'border-[var(--accent)] bg-[var(--accent-soft)]':'border-border bg-bg'}`} onClick={()=>{onChange(o.value);setOpen(false);}}>{o.label}{o.value===value&&<Check size={18}/>}</button>)}
        {!list.length&&<p role="status" className="p-3 text-[13px] text-text-dim">{t('Mos variant topilmadi')}</p>}
      </div>
    </section>
  </div>}
 </div>;
}
