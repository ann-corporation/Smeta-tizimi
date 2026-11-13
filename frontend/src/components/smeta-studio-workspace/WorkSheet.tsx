import { RowOrderControls } from '../row-order/RowOrderControls';
import { Fragment, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { t } from '../../i18n/til';
import { qidiruvKaliti } from '../../i18n/lotin-kirill';
import type { EstimateDoc, Occurrence } from '../../lib/smeta-studio/model';
import { normDec } from '../../lib/smeta-studio/model';
import type { DocCalc } from '../../lib/smeta-studio/calc';
import type { StudioCommand } from '../../lib/smeta-studio/commands';
import { parseQuantityInput } from '../../lib/smeta-studio/quantity-input';
import { indexEstimate } from '../smeta-studio-pro/hierarchy';
import { coefficientWorkCode } from '../../lib/smeta-studio/koef-notation';
import { unitKey } from '../../lib/smeta-studio/resource-match';
import { FmtN } from '../../lib/format';
import { KatNishon } from '../../umumiy/ui/KatNishon';
import { KAT_GURUH_NOMI } from '../../lib/f2-hujjat-korinish';
import { foiz, ishKesimi, scopeMatn, type Kesim } from './draft-kesim';

const GURUH_KAT = { chel: 'ЧЕЛ', mash: 'МАШ', mat: 'МАТ', ob: 'ОБ', nomalum: null } as const;
/** Tor stolda («Bo‘lim» va «Amallar» ustunlari) jadval to‘liq ko‘rinishi uchun ikki ustun olib tashlanadi. */
const NARROW = '(max-width: 1250px)';
function useNarrow(): boolean {
  return useSyncExternalStore(
    cb => { if (typeof window === 'undefined' || !window.matchMedia) return () => {}; const m = window.matchMedia(NARROW); m.addEventListener?.('change', cb); return () => m.removeEventListener?.('change', cb); },
    () => (typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(NARROW).matches), () => false);
}
const num = (v: string | null) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));

export function WorkSheet({doc,calculation,command,onWork,renderDetails,activeWorkId,revealToken=0,docked=false,unitText}: {
  doc:EstimateDoc;calculation:DocCalc;command:(c:StudioCommand)=>boolean;onWork:(id:string)=>void;renderDetails:(id:string)=>ReactNode;activeWorkId?:string|null;revealToken?:number;docked?:boolean;unitText?:Parameters<typeof ishKesimi>[3];
}) {
  const [search,setSearch]=useState(''), [selected,setSelected]=useState<string[]>([]), [page,setPage]=useState(0);
  const narrow=useNarrow();
  const [quantity,setQuantity]=useState(''), [destination,setDestination]=useState(''), [message,setMessage]=useState('');
  const rows=useMemo(()=>indexEstimate(doc).rows.filter(x=>x.kind==='work').map(x=>doc.occurrences[x.occurrenceId!]).filter((w):w is Occurrence=>!!w),[doc]);
  const filtered=useMemo(()=>{const query=qidiruvKaliti(search);return rows.filter(w=>qidiruvKaliti([w.source.code,w.source.name,doc.sections[w.sectionId]?.name].join(' ')).includes(query));},[rows,doc.sections,search]);
  const lastPage=Math.max(0,Math.ceil(filtered.length/50)-1);
  const currentPage=Math.min(page,lastPage);
  const visible=filtered.slice(currentPage*50,(currentPage+1)*50);
  useEffect(()=>{setPage(p=>Math.min(p,lastPage));},[lastPage]);
  const [quantityFocus,setQuantityFocus]=useState<string|null>(null);
  function nextQuantity(id:string,direction:number) {
    const position=filtered.findIndex(w=>w.id===id);
    const next=position>=0 ? filtered[position+direction] : null;
    if(!next)return;
    setPage(Math.floor((position+direction)/50));setQuantityFocus(next.id);onWork(next.id);
  }
  const revealed=useRef('');
  const keyboardRoot=useRef<HTMLElement>(null);
  useEffect(()=>{
    if(!quantityFocus)return;
    const input=Array.from(keyboardRoot.current?.querySelectorAll<HTMLInputElement>('input[data-work-quantity]') ?? []).find(el=>el.dataset.workQuantity===quantityFocus);
    if(input){input.focus();input.select();setQuantityFocus(null);}
  },[quantityFocus,currentPage]);
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
    <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{t('Ishlar va hajmlar')}</h2><input className="input ml-auto w-64 studio-search" aria-label={t('Jadvaldan qidirish')} placeholder={t('Shifr, ish yoki bo‘limdan qidirish')} value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}} /></div>
    <p className="text-xs text-text-dim studio-hint">{t('Hajmni satrda tahrirlang. Bir nechta ishni belgilang va bitta amal bilan o‘zgartiring.')} {t('Enter — keyingi hajm, Shift+Enter — oldingi, Esc — kiritishni bekor qilish.')}</p>
    {Boolean(ids.length) && <div className="studio-bulk">
      <span>{t('Tanlangan ishlar')}: {ids.length}</span>
      <button type="button" className="fz-btn fz-btn--sm" onClick={()=>reorderSelected('first')}>{t('Tanlanganlarni bo‘lim boshiga')}</button>
      <button type="button" className="fz-btn fz-btn--sm" onClick={()=>reorderSelected('last')}>{t('Tanlanganlarni bo‘lim oxiriga')}</button>
      <label>{t('Yangi hajm yoki formula')}<input className="input mt-1 block w-40" value={quantity} onChange={e=>setQuantity(e.target.value)} placeholder="12 * 0.6 * 0.4" /></label>
      <button className="fz-btn fz-btn--sm" disabled={!quantity.trim() || !sameUnit} onClick={()=>{if(!sameUnit)return;try{const q=parseQuantityInput(quantity).qiymat;batch(ids.map(id=>({type:'SET_QUANTITY',occurrenceId:id,quantity:q})));}catch{setMessage(t('Formulani tekshiring'));}}}>{t('Tanlanganlarga hajm qo‘llash')}</button>
      {!sameUnit && <span className="text-warn">{t('Umumiy hajm uchun birliklari bir xil ishlarni tanlang.')}</span>}
      <label>{t('Ko‘chirish bo‘limi')}<select className="input mt-1 block max-w-56" value={destination} onChange={e=>setDestination(e.target.value)}><option value="">{t('Bo‘limni tanlang')}</option>{Object.values(doc.sections).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <button className="fz-btn fz-btn--sm" disabled={!doc.sections[destination]} onClick={()=>batch(ids.filter(id=>doc.occurrences[id].sectionId!==destination).map(id=>({type:'MOVE_OCCURRENCE',occurrenceId:id,sectionId:destination})))}>{t('Ko‘chirish')}</button>
      <button className="fz-btn fz-btn--sm" onClick={()=>batch(ids.map(id=>({type:'REMOVE_OCCURRENCE',occurrenceId:id})))}>{t('Tanlangan ishlarni olib tashlash')}</button>
    </div>}
    {message && <p role="status" className="text-xs text-accent">{message}</p>}
    <div className="overflow-x-auto fz-table-wrap"><table className="fz-table"><thead><tr>
      <th className="c-chk"><input type="checkbox" aria-label={t('Sahifadagi ishlarni tanlash')} checked={!!visible.length && visible.every(w=>ids.includes(w.id))} onChange={e=>setSelected(old=>e.target.checked ? [...new Set([...old,...visible.map(w=>w.id)])] : old.filter(id=>!visible.some(w=>w.id===id)))} /></th>
      {([['Shifr va ish nomi','c-name'],['Bo‘lim','c-sec'],['Birlik','c-unit'],['Hajm','c-qty'],['Qiymat','c-amt'],['Amallar','c-act']] as const).filter(([,c])=>!narrow || (c!=='c-sec' && c!=='c-act')).map(([x,c])=><th className={c} key={x}>{t(x)}</th>)}
    </tr></thead><tbody>{visible.map((w,i)=><Fragment key={w.id}>{(i===0 || visible[i-1].sectionId!==w.sectionId) && <SectionHeadRow doc={doc} sectionId={w.sectionId} calculation={calculation} narrow={narrow} />}<WorkRow docked={docked} onNextQuantity={direction=>nextQuantity(w.id,direction)} active={activeWorkId===w.id} work={w} orderIndex={doc.sections[w.sectionId].items.indexOf(w.id)} orderCount={doc.sections[w.sectionId].items.length} section={doc.sections[w.sectionId]?.name ?? '—'} amount={calculation.occurrences[w.id]?.amount ?? null} selected={ids.includes(w.id)} select={v=>setSelected(old=>v ? [...new Set([...old,w.id])] : old.filter(id=>id!==w.id))} command={command} onWork={()=>onWork(w.id)} details={docked ? null : renderDetails(w.id)} narrow={narrow} kesim={ishKesimi(doc,calculation,w.id,unitText)} priceMissing={(calculation.occurrences[w.id]?.lines ?? []).filter(l=>l.issues.includes('PRICE_MISSING')).length} /></Fragment>)}</tbody></table></div>
    {!filtered.length && <p className="py-8 text-center text-sm text-text-dim">{t('Ish topilmadi. Katalog yoki AI yordamida ish qo‘shing.')}</p>}
    <div className="flex items-center justify-end gap-3 text-xs"><span>{filtered.length ? currentPage*50+1 : 0}–{Math.min((currentPage+1)*50,filtered.length)} / {filtered.length}</span><button className="fz-btn fz-btn--sm" disabled={!currentPage} onClick={()=>setPage(p=>p-1)}>{t('Oldingi')}</button><button className="fz-btn fz-btn--sm" disabled={(currentPage+1)*50>=filtered.length} onClick={()=>setPage(p=>p+1)}>{t('Keyingi')}</button></div>
  </section>;
}

function WorkRow({onNextQuantity,work:w,section,amount,selected,select,command,onWork,details,active,docked,orderIndex,orderCount,kesim,priceMissing,narrow}: {onNextQuantity:(direction:number)=>void;narrow:boolean;kesim:Kesim;priceMissing:number;orderIndex:number;orderCount:number;work:Occurrence;section:string;amount:string|null;selected:boolean;select:(v:boolean)=>void;command:(c:StudioCommand)=>boolean;onWork:()=>void;details:ReactNode;active?:boolean;docked?:boolean}) {
  const [expanded,setExpanded]=useState(false);
  const [value,setValue]=useState(w.quantity ?? ''), [error,setError]=useState(false);
  useEffect(()=>{setValue(w.quantity ?? '');setError(false);},[w.quantity]);
  function save() {try {const next=value.trim() ? normDec(parseQuantityInput(value).qiymat) : null;if(next!==w.quantity && !command({type:'SET_QUANTITY',occurrenceId:w.id,quantity:next})) throw new Error();setValue(next ?? '');setError(false);return true;}catch{setError(true);return false;}}
  const accepted=(w.coefficients ?? []).filter(c=>c.accepted), proposed=(w.coefficients ?? []).length-accepted.length;
  const n=num(amount);
  return <><tr aria-selected={active} className={`${selected ? 'studio-selected-row' : ''} ${active ? 'studio-active-row' : ''}`}>
    <td><input type="checkbox" aria-label={t('Tanlash: {n}',{n:w.source.code})} checked={selected} onChange={e=>select(e.target.checked)} /></td>
    <td className="studio-name-cell"><button className="text-left studio-row-name" aria-pressed={active} onClick={onWork}><span className="font-mono text-accent">{coefficientWorkCode(w)}</span><span className="block font-medium">{w.source.name ?? '—'}</span></button>
      <span className="studio-row-flags">
        {kesim.qismlar.map(q=>{const kat=GURUH_KAT[q.guruh];return kat ? <span key={q.guruh} title={`${t(KAT_GURUH_NOMI[q.guruh])} · ${foiz(q.ulush)}`}><KatNishon kat={kat}/></span> : <span key={q.guruh} className="fz-chip" title={t(KAT_GURUH_NOMI[q.guruh])}>{t('kat?')}</span>;})}
        {accepted.map(c=><span key={c.id} className="fz-chip fz-chip--accent" title={`${c.name} — ${scopeMatn(c.scope)} × ${c.value.replace('.',',')}`}>{`×${c.value.replace('.',',')}`} <small>{c.scope==='ALL' ? t('hammasi') : c.scope}</small></span>)}
        {proposed>0 && <span className="fz-chip" title={t('Qabul qilinmagan takliflar — hisobga olinmaydi')}>{t('taklif: {n}',{n:proposed})}</span>}
        {w.quantity==null && <span className="fz-chip fz-chip--warn">{t('hajm yo‘q')}</span>}
        {priceMissing>0 && <span className="fz-chip fz-chip--warn" title={t('Narxi belgilanmagan resurs qatorlari')}>{t('narxsiz: {n}',{n:priceMissing})}</span>}
        {!docked && <button className="mt-1 text-[11px] underline text-text-dim" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>{t('Koeffitsientlar')} · {accepted.length}</button>}
        <span className="studio-row-order"><RowOrderControls index={orderIndex} count={orderCount} label={w.source.code} onMove={index=>command({type:'MOVE_OCCURRENCE',occurrenceId:w.id,sectionId:w.sectionId,index})}/></span>
        {docked && <span className="studio-row-coeff">{t('Koeffitsientlar')}: {accepted.length}</span>}
      </span></td>
    {!narrow && <td className="studio-sec-cell">{section}</td>}<td className="fz-c-unit">{w.basis.unitLabel ?? '—'}</td>
    <td><input className={`input w-32 tabular-nums ${error ? 'border-danger' : ''}`} aria-label={t('Hajm: {n}',{n:w.source.code})} data-work-quantity={w.id} aria-invalid={error} value={value} onChange={e=>setValue(e.target.value)} onBlur={save} onKeyDown={e=>{if(e.key==='Enter' && !e.nativeEvent.isComposing) {e.preventDefault();if(save())onNextQuantity(e.shiftKey ? -1 : 1);} if(e.key==='Escape'){setValue(w.quantity ?? '');setError(false);}}} />{error && <p role="alert" className="text-danger">{t('Formulani tekshiring')}</p>}</td>
    <td className="fz-c-num studio-amount">{n==null ? <span className="text-text-mute" title={t('Summa hisoblanmagan: hajm, norma yoki narx yetishmaydi')}>{t('Aniqlanmagan')}</span> : <FmtN val={n}/>}
      {kesim.qismlar.length>0 && <span className="fz-split studio-mini-split" aria-hidden="true">{kesim.qismlar.map(q=><i key={q.guruh} className={`fz-bg-${q.guruh}`} style={{flexGrow:Math.max(q.ulush,0.002)}}/>)}</span>}</td>
    {!narrow && <td><button className="underline" onClick={onWork}>{t(docked ? 'Ochish →' : 'Tarkibi va narxlar')}</button></td>}
  </tr>{!docked && expanded && <tr><td colSpan={narrow ? 5 : 7} className="bg-surface-2 p-3">{details}</td></tr>}</>;
}

function SectionHeadRow({doc,sectionId,calculation,narrow}:{doc:EstimateDoc;sectionId:string;calculation:DocCalc;narrow:boolean}) {
  const s=doc.sections[sectionId], c=calculation.sections[sectionId];
  if(!s) return null;
  const jami=num(c?.amount ?? null), known=num(c?.knownAmount ?? null);
  return <tr className="fz-row-rz studio-sec-row"><td colSpan={narrow ? 4 : 5}>{s.name}<span className="studio-sec-meta">{t('{n} ta ish',{n:s.items.length})}</span></td><td colSpan={narrow ? 1 : 2} className="fz-c-num">{jami!=null ? <FmtN val={jami}/> : <span title={t('Bo‘limda summasi noma’lum qatorlar bor — faqat ma’lum qism ko‘rsatilgan')}>{known!=null ? <>≈ <FmtN val={known}/></> : '—'}</span>}</td></tr>;
}
