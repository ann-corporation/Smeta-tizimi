import { useEffect, useRef, useState } from 'react';
import { update } from 'idb-keyval';
import { t } from '../../i18n/til';
import type { InternetNatija } from '../../lib/smeta-ai/internet-narx';
import { readResearch, type PriceResearchItem } from './price-research-store';

/** Observations survive reload; choosing a source is a separate, explicit operator decision. */
export function PriceResearchQueue({scope,revision,onApply,activeKeys}: {scope:string;revision:number;onApply:(key:string,result:InternetNatija)=>boolean;activeKeys?:readonly string[]}) {
  const [items,setItems]=useState<PriceResearchItem[]>([]),[error,setError]=useState(false),[reload,setReload]=useState(0);
  const [page,setPage]=useState(0);
  const applying=useRef(false);
  const [selection,setSelection]=useState<Record<string,number>>({}),[confirmed,setConfirmed]=useState<Record<string,boolean>>({});
  useEffect(()=>{let active=true;setItems([]);readResearch(scope).then(data=>{if(active){setItems(Object.values(data ?? {}));setError(false);}}).catch(()=>{if(active)setError(true);});return()=>{active=false;};},[scope,revision,reload]);
  useEffect(()=>{setSelection({});setConfirmed({});setPage(0);},[scope,revision,reload]);
  const keys=activeKeys ? new Set(activeKeys) : null;
  const pending=keys ? items.filter(item=>keys.has(item.key)) : items;
  const currentPage=Math.min(page,Math.max(0,Math.ceil(pending.length/50)-1));
  if(!pending.length && !error)return null;
  return <section className="karta space-y-3 p-3" aria-label={t('Narx izlanishlari navbati')}>
    <h3 className="font-semibold">{t('Narx izlanishlari navbati')} · {pending.length}</h3>
    <p className="text-xs text-text-dim">{t('Topilgan takliflar shu qurilmada saqlanadi. Mos manbani tanlab, shartlarini tasdiqlang; noma’lum narxlar hisobga kirmaydi.')}</p>
    {error && <p role="alert" className="text-danger text-xs">{t('Izlanishlar navbati qurilmada ochilmadi. Qayta urinib ko‘ring.')} <button className="underline" onClick={()=>setReload(n=>n+1)}>{t('Qayta urinish')}</button></p>}
    {pending.slice(currentPage*50,(currentPage+1)*50).map(item=>{const index=selection[item.key],source=index==null?null:item.result.manbalar[index];const applicable=source?.tekshirildi && source.smetaNarx!=null && source.nds!=='nomalum';return <article key={item.key} className="rounded-lg border border-border p-3 space-y-2">
      <p className="text-sm font-medium">{item.name}</p><p className="text-xs text-text-dim">{item.result.izoh}</p>
      {!item.result.manbalar.length && <p className="text-xs text-warn">{t('Ishonchli taklif topilmadi. Yetkazuvchidan KP yoki dalilli qo‘lda narx kerak.')}</p>}
      {item.result.manbalar.map((m,i)=><label key={`${m.url}:${i}`} className="flex items-start gap-2 text-xs"><input type="radio" name={`price-${item.key}`} checked={index===i} onChange={()=>{setSelection(old=>({...old,[item.key]:i}));setConfirmed(old=>({...old,[item.key]:false}));}} /><span><a className="text-accent underline" href={m.url} target="_blank" rel="noopener noreferrer">{m.sotuvchi || m.domen}</a> · {m.narx} / {m.birlik ?? '—'} · {m.nds==='bilan' ? t('QQS bilan') : m.nds==='siz' ? t('QQS siz') : t('QQS noma’lum')}<span className="block text-text-dim">{m.tekshirildi ? t('Sahifadagi narx tekshirilgan') : t('Sahifadagi narx tasdiqlanmagan')} · {m.nds==='nomalum' ? '—' : m.smetaNarx ?? '—'} {t('smeta birligida, QQS siz')}</span></span></label>)}
      {source && !applicable && <p className="text-xs text-warn">{t('Bu taklif avtomatik qo‘llanmaydi. QQS, birlik yoki sahifa dalilini aniqlashtirib, qo‘lda asoslang.')}</p>}
      {applicable && <><label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={confirmed[item.key]===true} onChange={e=>setConfirmed(old=>({...old,[item.key]:e.target.checked}))}/>{t('Mahsulot, komplektatsiya, birlik, QQS va yetkazish shartlarini tekshirdim.')}</label><button className="tugma tugma-asosiy px-3 py-1" disabled={!confirmed[item.key]} onClick={async()=>{
        if(!source || !confirmed[item.key] || applying.current)return;
        applying.current=true;
        const result={...item.result,manbalar:[source],narx:source.smetaNarx,izoh:t('Manba smetachi tomonidan solishtirilib tanlandi.')};
        try{if(!onApply(item.key,result))return;await update<Record<string,PriceResearchItem>>(scope,old=>{const next={...old};delete next[item.key];return next;});setReload(n=>n+1);}catch{setError(true);}finally{applying.current=false;}
      }}>{t('Tanlangan manba narxini qo‘llash')}</button></>}
    </article>;})}
    {pending.length>50 && <div className="flex justify-end gap-3 text-xs"><button className="tugma px-2" disabled={!currentPage} onClick={()=>setPage(currentPage-1)}>{t('Oldingi')}</button><span>{currentPage*50+1}–{Math.min((currentPage+1)*50,pending.length)} / {pending.length}</span><button className="tugma px-2" disabled={(currentPage+1)*50>=pending.length} onClick={()=>setPage(currentPage+1)}>{t('Keyingi')}</button></div>}
  </section>;
}
