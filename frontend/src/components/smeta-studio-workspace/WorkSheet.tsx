import { RowOrderControls } from '../row-order/RowOrderControls';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { t } from '../../i18n/til';
import type { EstimateDoc, Occurrence } from '../../lib/smeta-studio/model';
import { normDec } from '../../lib/smeta-studio/model';
import type { DocCalc } from '../../lib/smeta-studio/calc';
import type { StudioCommand } from '../../lib/smeta-studio/commands';
import { parseQuantityInput } from '../../lib/smeta-studio/quantity-input';
import { indexEstimate } from '../smeta-studio-pro/hierarchy';
import { coefficientWorkCode } from '../../lib/smeta-studio/koef-notation';
import { unitKey } from '../../lib/smeta-studio/resource-match';

export function WorkSheet({doc,calculation,command,onWork,renderDetails,activeWorkId,revealToken=0,docked=false}: {
  doc:EstimateDoc;calculation:DocCalc;command:(c:StudioCommand)=>boolean;onWork:(id:string)=>void;renderDetails:(id:string)=>ReactNode;activeWorkId?:string|null;revealToken?:number;docked?:boolean;
}) {
  const [search,setSearch]=useState(''), [selected,setSelected]=useState<string[]>([]), [page,setPage]=useState(0);
  const [quantity,setQuantity]=useState(''), [destination,setDestination]=useState(''), [message,setMessage]=useState('');
  const rows=useMemo(()=>indexEstimate(doc).rows.filter(x=>x.kind==='work').map(x=>doc.occurrences[x.occurrenceId!]).filter((w):w is Occurrence=>!!w),[doc]);
  const filtered=useMemo(()=>rows.filter(w=>`${w.source.code} ${w.source.name} ${doc.sections[w.sectionId]?.name}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())),[rows,doc.sections,search]);
  const visible=filtered.slice(page*50,(page+1)*50);
  const revealed=useRef('');
  const keyboardRoot=useRef<HTMLElement>(null);
  useEffect(()=>{const key=JSON.stringify([doc.draftId,activeWorkId,revealToken]);if(!activeWorkId || revealed.current===key)return;revealed.current=key;const found=filtered.findIndex(w=>w.id===activeWorkId);if(found>=0)setPage(Math.floor(found/50));else {setSearch('');const position=rows.findIndex(w=>w.id===activeWorkId);if(position>=0)setPage(Math.floor(position/50));}},[activeWorkId,doc.draftId,revealToken,filtered,rows]);
  useEffect(()=>{setPage(0);setSelected([]);},[doc.draftId]);
  const ids=selected.filter(id=>!!doc.occurrences[id]);
  const selectedUnits=ids.map(id=>unitKey(doc.occurrences[id].basis.unitLabel));
  const sameUnit=selectedUnits.length>0 && selectedUnits.every(u=>!!u && u===selectedUnits[0]);
  function batch(commands:StudioCommand[]) {if(!commands.length) return; if(command({type:'BATCH',label:t('Jadvaldagi guruh tahriri'),commands})){setSelected([]);setMessage(t('O‘zgarishlar qo‘llandi. Barchasini bir marta bekor qilish mumkin.'));}}
  function reorderSelected(edge:'first'|'last') {
    const commands:StudioCommand[]=[];
    for(const section of Object.values(doc.sections)) {
      const members=section.items.filter(id=>ids.includes(id));
      for(const id of edge==='first' ? [...members].reverse() : members)
        commands.push({type:'MOVE_OCCURRENCE',occurrenceId:id,sectionId:section.id,index:edge==='first' ? 0 : section.items.length-1});
    }
    batch(commands);
  }
  return <section ref={keyboardRoot} tabIndex={docked ? 0 : undefined} className={`karta min-w-0 space-y-3 p-3 ${docked ? 'studio-worksheet' : ''}`} aria-label={t('Smeta ishlar jadvali')} onKeyDown={e=>{if(!docked || !(e.target instanceof HTMLElement) || e.target.closest('input,textarea,select') || !['ArrowUp','ArrowDown'].includes(e.key))return;const position=filtered.findIndex(w=>w.id===activeWorkId);const next=filtered[Math.max(0,Math.min(filtered.length-1,position+(e.key==='ArrowDown' ? 1 : -1)))];if(next){e.preventDefault();keyboardRoot.current?.focus({preventScroll:true});onWork(next.id);}}}>
    <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{t('Ishlar va hajmlar')}</h2><input className="input ml-auto w-64" aria-label={t('Jadvaldan qidirish')} placeholder={t('Shifr, ish yoki bo‘limdan qidirish')} value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}} /></div>
    <p className="text-xs text-text-dim">{t('Hajmni satrda tahrirlang. Bir nechta ishni belgilang va bitta amal bilan o‘zgartiring.')}</p>
    {Boolean(ids.length) && <div className="flex flex-wrap items-end gap-2 rounded-lg border border-accent/40 bg-accent/5 p-3 text-xs">
      <span>{t('Tanlangan ishlar')}: {ids.length}</span>
      <button type="button" className="tugma h-8 px-2" onClick={()=>reorderSelected('first')}>{t('Tanlanganlarni bo‘lim boshiga')}</button>
      <button type="button" className="tugma h-8 px-2" onClick={()=>reorderSelected('last')}>{t('Tanlanganlarni bo‘lim oxiriga')}</button>
      <label>{t('Yangi hajm yoki formula')}<input className="input mt-1 block w-40" value={quantity} onChange={e=>setQuantity(e.target.value)} placeholder="12 * 0.6 * 0.4" /></label>
      <button className="tugma h-8 px-2" disabled={!quantity.trim() || !sameUnit} onClick={()=>{if(!sameUnit)return;try{const q=parseQuantityInput(quantity).qiymat;batch(ids.map(id=>({type:'SET_QUANTITY',occurrenceId:id,quantity:q})));}catch{setMessage(t('Formulani tekshiring'));}}}>{t('Tanlanganlarga hajm qo‘llash')}</button>
      {!sameUnit && <span className="text-warn">{t('Umumiy hajm uchun birliklari bir xil ishlarni tanlang.')}</span>}
      <label>{t('Ko‘chirish bo‘limi')}<select className="input mt-1 block max-w-56" value={destination} onChange={e=>setDestination(e.target.value)}><option value="">{t('Bo‘limni tanlang')}</option>{Object.values(doc.sections).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <button className="tugma h-8 px-2" disabled={!doc.sections[destination]} onClick={()=>batch(ids.filter(id=>doc.occurrences[id].sectionId!==destination).map(id=>({type:'MOVE_OCCURRENCE',occurrenceId:id,sectionId:destination})))}>{t('Ko‘chirish')}</button>
      <button className="tugma h-8 px-2" onClick={()=>batch(ids.map(id=>({type:'REMOVE_OCCURRENCE',occurrenceId:id})))}>{t('Tanlangan ishlarni olib tashlash')}</button>
    </div>}
    {message && <p role="status" className="text-xs text-accent">{message}</p>}
    <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="border-y border-border bg-surface-1"><tr>
      <th className="p-2"><input type="checkbox" aria-label={t('Sahifadagi ishlarni tanlash')} checked={!!visible.length && visible.every(w=>ids.includes(w.id))} onChange={e=>setSelected(old=>e.target.checked ? [...new Set([...old,...visible.map(w=>w.id)])] : old.filter(id=>!visible.some(w=>w.id===id)))} /></th>
      {['Shifr va ish nomi','Bo‘lim','Birlik','Hajm','Qiymat','Amallar'].map(x=><th className="p-2" key={x}>{t(x)}</th>)}
    </tr></thead><tbody>{visible.map(w=><WorkRow key={w.id} docked={docked} active={activeWorkId===w.id} work={w} orderIndex={doc.sections[w.sectionId].items.indexOf(w.id)} orderCount={doc.sections[w.sectionId].items.length} section={doc.sections[w.sectionId]?.name ?? '—'} amount={calculation.occurrences[w.id]?.amount ?? null} selected={ids.includes(w.id)} select={v=>setSelected(old=>v ? [...new Set([...old,w.id])] : old.filter(id=>id!==w.id))} command={command} onWork={()=>onWork(w.id)} details={docked ? null : renderDetails(w.id)} />)}</tbody></table></div>
    {!filtered.length && <p className="py-8 text-center text-sm text-text-dim">{t('Ish topilmadi. Katalog yoki AI yordamida ish qo‘shing.')}</p>}
    <div className="flex items-center justify-end gap-3 text-xs"><span>{filtered.length ? page*50+1 : 0}–{Math.min((page+1)*50,filtered.length)} / {filtered.length}</span><button className="tugma px-2" disabled={!page} onClick={()=>setPage(p=>p-1)}>{t('Oldingi')}</button><button className="tugma px-2" disabled={(page+1)*50>=filtered.length} onClick={()=>setPage(p=>p+1)}>{t('Keyingi')}</button></div>
  </section>;
}

function WorkRow({work:w,section,amount,selected,select,command,onWork,details,active,docked,orderIndex,orderCount}: {orderIndex:number;orderCount:number;work:Occurrence;section:string;amount:string|null;selected:boolean;select:(v:boolean)=>void;command:(c:StudioCommand)=>boolean;onWork:()=>void;details:ReactNode;active?:boolean;docked?:boolean}) {
  const [expanded,setExpanded]=useState(false);
  const [value,setValue]=useState(w.quantity ?? ''), [error,setError]=useState(false);
  useEffect(()=>{setValue(w.quantity ?? '');setError(false);},[w.quantity]);
  function save() {try {const next=value.trim() ? normDec(parseQuantityInput(value).qiymat) : null;if(next!==w.quantity && !command({type:'SET_QUANTITY',occurrenceId:w.id,quantity:next})) throw new Error();setValue(next ?? '');setError(false);}catch{setError(true);}}
  return <><tr aria-selected={active} className={`border-b border-border align-top ${selected ? 'bg-accent/5' : ''} ${active ? 'studio-active-row' : ''}`}>
    <td className="p-2"><input type="checkbox" aria-label={t('Tanlash: {n}',{n:w.source.code})} checked={selected} onChange={e=>select(e.target.checked)} /></td>
    <td className="p-2 min-w-64"><button className="text-left studio-row-name" aria-pressed={active} onClick={onWork}><span className="font-mono text-accent">{coefficientWorkCode(w)}</span><span className="block font-medium">{w.source.name ?? '—'}</span></button>{!docked && <button className="mt-1 text-[11px] underline text-text-dim" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>{t('Koeffitsientlar')} · {(w.coefficients ?? []).filter(c=>c.accepted).length}</button>}{docked && <span className="studio-row-coeff">{t('Koeffitsientlar')}: {(w.coefficients ?? []).filter(c=>c.accepted).length}</span>}</td>
    <td className="p-2 max-w-40">{section}<div className="mt-2"><RowOrderControls index={orderIndex} count={orderCount} label={w.source.code} onMove={index=>command({type:'MOVE_OCCURRENCE',occurrenceId:w.id,sectionId:w.sectionId,index})}/></div></td><td className="p-2 whitespace-nowrap">{w.basis.unitLabel ?? '—'}</td>
    <td className="p-2"><input className={`input w-32 tabular-nums ${error ? 'border-danger' : ''}`} aria-label={t('Hajm: {n}',{n:w.source.code})} aria-invalid={error} value={value} onChange={e=>setValue(e.target.value)} onBlur={save} onKeyDown={e=>{if(e.key==='Enter') {e.preventDefault();save();} if(e.key==='Escape'){setValue(w.quantity ?? '');setError(false);}}} />{error && <p role="alert" className="text-danger">{t('Formulani tekshiring')}</p>}</td>
    <td className="p-2 whitespace-nowrap tabular-nums">{amount ?? t('Aniqlanmagan')}</td><td className="p-2"><button className="underline" onClick={onWork}>{t(docked ? 'Ochish →' : 'Tarkibi va narxlar')}</button></td>
  </tr>{!docked && expanded && <tr><td colSpan={7} className="bg-surface-1 p-3">{details}</td></tr>}</>;
}
