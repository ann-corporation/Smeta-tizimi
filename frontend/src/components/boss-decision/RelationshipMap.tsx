import {useState} from 'react';
import type {MindmapGraf,MindmapTugun} from '../../api/t2-mindmap';
import {t} from '../../i18n/til';
import {entityLabels,neighbours} from './cockpit-data';

export default function RelationshipMap({graph,selected,onSelect}:{graph:MindmapGraf;selected:MindmapTugun;onSelect:(id:string)=>void}) {
  const [page,setPage]=useState(0);
  const linked=neighbours(graph,selected.id);const size=8;const paged=linked.length>size;const visible=linked.slice(page*size,(page+1)*size);
  const positions=visible.map((node,i)=>({node,x:i%2===0?15:625,y:25+Math.floor(i/2)*112}));
  return <section aria-label={t('Bog‘lanishlar diagrammasi')} className="space-y-3">
    <div className="flex justify-between flex-wrap gap-2 text-xs text-text-dim"><p>{t('Chiziqlar bazadagi haqiqiy aloqalarni bildiradi. Tugunni bosib ichiga kiring.')}</p><p>{linked.length} {t('bevosita bog‘lanish')}</p></div>
    <div className="md:hidden rounded-2xl border border-accent/30 bg-accent/5 p-4"><p className="font-medium mb-3">{selected.nom}</p><div className="grid sm:grid-cols-2 gap-2">{visible.map(node=><button type="button" key={node.id} onClick={()=>onSelect(node.id)} aria-label={`${t(entityLabels[node.tur])}: ${node.nom}`} className="text-left border border-white/10 rounded-xl p-3 bg-surface"><span className="text-xs text-text-dim">{t(entityLabels[node.tur])}</span><span className="block text-sm mt-1 break-words">{node.nom}</span></button>)}</div>{linked.length===0&&<p className="text-sm text-text-dim">{t('Ushbu tugun uchun aloqa qayd etilmagan.')}</p>}</div>
    <div className="hidden md:block overflow-auto rounded-2xl border border-white/10 bg-gradient-to-br from-accent/10 via-transparent to-emerald-400/5">
      <div className="relative" style={{width:890,height:480}}>
        <svg width="890" height="480" aria-hidden="true" className="absolute inset-0"><defs><linearGradient id="boss-edge"><stop stopColor="#818cf8"/><stop offset="1" stopColor="#2dd4bf"/></linearGradient></defs>{positions.map(({node,x,y})=><path key={node.id} d={`M 445 240 C ${x<400?250:640} 240, ${x<400?365:525} ${y+38}, ${x<400?265:625} ${y+38}`} stroke="url(#boss-edge)" opacity=".6" strokeWidth="1.5" fill="none"/>)}</svg>
        <div className="absolute w-[250px] rounded-2xl border border-accent/60 bg-surface p-5 shadow-lg" style={{left:320,top:181}}><span className="text-xs text-accent">{t(entityLabels[selected.tur])}</span><p className="font-semibold mt-2 break-words line-clamp-3">{selected.nom}</p></div>
        {positions.map(({node,x,y})=><button type="button" aria-label={`${t(entityLabels[node.tur])}: ${node.nom}`} key={node.id} style={{left:x,top:y}} onClick={()=>onSelect(node.id)} className="absolute text-left w-[250px] min-h-[78px] rounded-xl border border-white/15 bg-surface p-3 hover:border-accent focus-visible:outline-2 focus-visible:outline-accent transition-colors"><span className="text-[11px] text-text-dim">{t(entityLabels[node.tur])}</span><span className="block font-medium text-sm truncate mt-1" title={node.nom}>{node.nom}</span></button>)}
        {linked.length===0&&<p className="absolute bottom-12 w-full text-center text-text-dim text-sm">{t('Ushbu tugun uchun aloqa qayd etilmagan.')}</p>}
      </div>
    </div>
    {paged&&<div className="flex items-center gap-4 text-sm"><button type="button" disabled={page===0} onClick={()=>setPage(page-1)} className="disabled:opacity-30 underline">{t('Oldingi')}</button><span>{page*size+1}–{Math.min((page+1)*size,linked.length)} / {linked.length}</span><button type="button" disabled={(page+1)*size>=linked.length} onClick={()=>setPage(page+1)} className="disabled:opacity-30 underline">{t('Keyingi')}</button></div>}
  </section>;
}
