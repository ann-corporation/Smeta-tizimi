import { RowOrderControls } from '../row-order/RowOrderControls';
import { useMemo, useState } from 'react';
import type { EstimateDoc } from '../../lib/smeta-studio/model';
import type { StudioCommand } from '../../lib/smeta-studio/commands';
import { indexEstimate } from '../smeta-studio-pro/hierarchy';
import { t } from '../../i18n/til';

export function StudioSections({doc,target,onTarget,command}: {doc:EstimateDoc;target:string|null;onTarget:(id:string)=>void;command:(c:StudioCommand)=>boolean}) {
  const [name,setName]=useState('');
  const sections=useMemo(()=>indexEstimate(doc).rows.filter(r=>r.kind==='section'),[doc]);
  return <section className="studio-sections" aria-label={t('Smeta bo‘limlari')}>
    <p className="studio-eyebrow">{t('Ish qo‘shiladigan bo‘lim')}</p>
    {sections.map(s=>{const section=doc.sections[s.sectionId];const siblings=section.parentId ? doc.sections[section.parentId].children : doc.rootOrder;return <div key={s.key}><button type="button" key={s.key} aria-pressed={target===s.sectionId} style={{paddingLeft:12+Math.min(s.depth,8)*12}} onClick={()=>onTarget(s.sectionId)}><span aria-hidden="true">▤</span><span>{s.label}</span><small>{doc.sections[s.sectionId].items.length}</small></button><RowOrderControls index={siblings.indexOf(section.id)} count={siblings.length} label={section.name} onMove={index=>command({type:'MOVE_SECTION',sectionId:section.id,parentId:section.parentId,index})}/></div>;})}
    {!sections.length && <p className="studio-empty">{t('Birinchi ish qo‘shilganda bo‘lim yaratiladi.')}</p>}
    <form onSubmit={e=>{e.preventDefault();if(!name.trim())return;const sectionId=crypto.randomUUID();if(command({type:'ADD_SECTION',sectionId,parentId:null,name:name.trim()})){onTarget(sectionId);setName('');}}}>
      <input aria-label={t('Yangi bo‘lim')} placeholder={t('Yangi bo‘lim nomi…')} value={name} onChange={e=>setName(e.target.value)} maxLength={300}/><button type="submit" disabled={!name.trim()} aria-label={t('Bo‘lim qo‘shish')}>+</button>
    </form>
  </section>;
}
