import { useMemo, useState, type ReactNode } from 'react';
import type { EstimateDoc } from '../../lib/smeta-studio/model';
import type { DocCalc } from '../../lib/smeta-studio/calc';
import type { StudioCommand } from '../../lib/smeta-studio/commands';
import { Inspector, type PricingProps } from '../smeta-studio-pro/EstimateEditingWorkspace';
import { studioPanelLabels } from '../smeta-studio-pro/studioPanelLabels';
import { indexEstimate } from '../smeta-studio-pro/hierarchy';
import { coefficientWorkCode } from '../../lib/smeta-studio/koef-notation';
import { t } from '../../i18n/til';

export type InspectorTab = 'work'|'coefficients'|'resources'|'ai'|'calculator';
export function StudioInspector({doc,calculation,workId,onWork,command,pricing,tab,onTab,coefficients,ai,calculator}: {
  doc:EstimateDoc;calculation:DocCalc;workId:string|null;onWork:(id:string)=>void;command:(c:StudioCommand)=>boolean;
  pricing:PricingProps;tab:InspectorTab;onTab:(tab:InspectorTab)=>void;
  coefficients:ReactNode;ai:ReactNode;calculator:ReactNode;
}) {
  const rows=useMemo(()=>indexEstimate(doc).rows,[doc]);
  const work=workId ? doc.occurrences[workId] : null;
  const [resourceKey,setResourceKey]=useState<string|null>(null);
  const workRow=rows.find(r=>r.kind==='work' && r.occurrenceId===workId);
  const resourceRows=rows.filter(r=>r.kind==='resource' && r.occurrenceId===workId);
  const resourceRow=resourceRows.find(r=>r.key===resourceKey) ?? resourceRows[0];
  const works=rows.filter(r=>r.kind==='work'),position=works.findIndex(r=>r.occurrenceId===workId);
  return <aside className="studio-inspector studio-pane" aria-label={t('Tanlangan ish nazorati')}>
    <div className="studio-pane-title"><span className="studio-step">03</span><strong>{t('Ish nazorati')}</strong><span className="text-[10px] text-text-dim">{position<0 ? 0 : position+1}/{works.length}</span><button aria-label={t('Oldingi ish')} disabled={position<=0} onClick={()=>onWork(works[position-1].occurrenceId!)}>↑</button><button aria-label={t('Keyingi ish')} disabled={position<0 || position>=works.length-1} onClick={()=>onWork(works[position+1].occurrenceId!)}>↓</button></div>
    <div className="studio-selection">
      <span className="studio-eyebrow">{t('Tanlangan ish')}</span>
      {work ? <><strong className="studio-work-code">{coefficientWorkCode(work)}</strong><p title={work.source.name ?? ''}>{work.source.name}</p><div className="studio-selection-meta"><span>{work.quantity ?? '—'} {work.basis.unitLabel ?? '—'}</span><span>{calculation.occurrences[work.id]?.amount ?? t('Narx to‘liq emas')}</span></div></> : <p>{t('Jadvaldan ishni tanlang. Uning barcha sozlamalari shu yerda ochiladi.')}</p>}
    </div>
    <div role="tablist" aria-label={t('Ish nazorati bo‘limlari')} className="studio-inspector-tabs">
      {([['work','Hajm'],['coefficients','Koeff.'],['resources','Resurs'],['ai','AI'],['calculator','Hisob']] as const).map(([key,label])=><button key={key} role="tab" aria-label={t(key==='ai' ? 'Smetachi AI' : label)} aria-selected={tab===key} onClick={()=>onTab(key)}>{t(label)}</button>)}
    </div>
    <div className="studio-pane-scroll">
      <div hidden={tab!=='ai'}>{ai}</div>
      <div hidden={tab!=='calculator'}>{calculator}</div>
      <div hidden={tab!=='coefficients'}>{work ? coefficients : <p className="studio-empty">{t('Avval jadvaldan ish tanlang.')}</p>}</div>
      <div hidden={tab!=='work'}>{workRow ? <Inspector key={`${doc.draftId}:${doc.context.companyId}:${workRow.key}`} doc={doc} row={workRow} labels={studioPanelLabels()} command={command} pricing={pricing}/> : <p className="studio-empty">{t('Avval jadvaldan ish tanlang.')}</p>}</div>
      <div hidden={tab!=='resources'}>
        <label className="studio-resource-choice">{t('Ish tarkibidagi resurs')}<select value={resourceRow?.key ?? ''} onChange={e=>setResourceKey(e.target.value)}><option value="" disabled>{t('Resursni tanlang')}</option>{resourceRows.map(r=><option key={r.key} value={r.key}>{r.code} · {r.label}</option>)}</select></label>
        {resourceRow ? <Inspector resourceOnly key={`${doc.draftId}:${doc.context.companyId}:${resourceRow.key}`} doc={doc} row={resourceRow} labels={studioPanelLabels()} command={command} pricing={pricing}/> : <p className="studio-empty">{t('Bu ishning resurs tarkibi mavjud emas.')}</p>}
      </div>
    </div>
  </aside>;
}
