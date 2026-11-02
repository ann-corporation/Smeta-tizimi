import { useMemo, useState, type ReactNode } from 'react';
import type { EstimateDoc } from '../../lib/smeta-studio/model';
import type { DocCalc } from '../../lib/smeta-studio/calc';
import type { StudioCommand } from '../../lib/smeta-studio/commands';
import { Inspector, type PricingProps } from '../smeta-studio-pro/EstimateEditingWorkspace';
import { studioPanelLabels } from '../smeta-studio-pro/studioPanelLabels';
import { indexEstimate } from '../smeta-studio-pro/hierarchy';
import { coefficientWorkCode } from '../../lib/smeta-studio/koef-notation';
import { t } from '../../i18n/til';
import { FmtN } from '../../lib/format';
import { KatNishon } from '../../umumiy/ui/KatNishon';
import { KAT_GURUH_NOMI } from '../../lib/f2-hujjat-korinish';
import { foiz, ishKesimi } from './draft-kesim';

const GURUH_KAT = { chel: 'ЧЕЛ', mash: 'МАШ', mat: 'МАТ', ob: 'ОБ', nomalum: null } as const;

export type InspectorTab = 'work'|'coefficients'|'resources'|'ai'|'calculator';
export function StudioInspector({doc,calculation,workId,onWork,command,pricing,tab,onTab,coefficients,ai,calculator,unitText}: {
  unitText?:Parameters<typeof ishKesimi>[3];
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
  const kesim=useMemo(()=>workId ? ishKesimi(doc,calculation,workId,unitText) : null,[doc,calculation,workId,unitText]);
  const amountNum=work ? Number(calculation.occurrences[work.id]?.amount ?? NaN) : NaN;
  const accepted=(work?.coefficients ?? []).filter(c=>c.accepted).length;
  return <aside className="studio-inspector studio-pane" aria-label={t('Tanlangan ish nazorati')}>
    <div className="studio-pane-title"><span className="studio-step">03</span><strong>{t('Ish nazorati')}</strong><span className="text-[10px] text-text-dim">{position<0 ? 0 : position+1}/{works.length}</span><button aria-label={t('Oldingi ish')} disabled={position<=0} onClick={()=>onWork(works[position-1].occurrenceId!)}>↑</button><button aria-label={t('Keyingi ish')} disabled={position<0 || position>=works.length-1} onClick={()=>onWork(works[position+1].occurrenceId!)}>↓</button></div>
    <div className="studio-selection">
      <span className="studio-eyebrow">{t('Tanlangan ish')}</span>
      {work ? <><strong className="studio-work-code">{coefficientWorkCode(work)}</strong><p title={work.source.name ?? ''}>{work.source.name}</p>
        <div className="studio-selection-meta"><span>{work.quantity ?? '—'} {work.basis.unitLabel ?? '—'}</span><span>{Number.isFinite(amountNum) ? <b><FmtN val={amountNum}/> {doc.currency}</b> : t('Narx to‘liq emas')}</span></div>
        {kesim && kesim.qismlar.length>0 && <>
          <div className="fz-split studio-selection-split" role="img" aria-label={kesim.qismlar.map(q=>`${t(KAT_GURUH_NOMI[q.guruh])} ${foiz(q.ulush)}`).join(', ')}>{kesim.qismlar.map(q=><i key={q.guruh} className={`fz-bg-${q.guruh}`} style={{flexGrow:Math.max(q.ulush,0.002)}}/>)}</div>
          <div className="studio-selection-cats">{kesim.qismlar.map(q=>{const kat=GURUH_KAT[q.guruh];return <span key={q.guruh}>{kat ? <KatNishon kat={kat}/> : <span className="fz-chip">{t('kat?')}</span>} {foiz(q.ulush)}</span>;})}{accepted>0 && <span className="fz-chip fz-chip--accent">{t('koeff.: {n}',{n:accepted})}</span>}</div></>}
      </> : <p>{t('Jadvaldan ishni tanlang. Uning barcha sozlamalari shu yerda ochiladi.')}</p>}
    </div>
    <div role="tablist" aria-label={t('Ish nazorati bo‘limlari')} className="studio-inspector-tabs">
      {([['work','Hajm'],['coefficients','Koeff.'],['resources','Resurs'],['ai','AI'],['calculator','Hisob']] as const).map(([key,label])=><button key={key} role="tab" aria-label={t(key==='ai' ? 'Smetachi AI' : label)} aria-selected={tab===key} onClick={()=>onTab(key)}>{t(label)}</button>)}
    </div>
    <div className="studio-pane-scroll">
      <div hidden={tab!=='ai'}>{ai}</div>
      <div className="fz-panel studio-panel" hidden={tab!=='calculator'}><span className="fz-panel__h">{t('Hajm kalkulyatori')}</span>{calculator}</div>
      <div className="fz-panel studio-panel" hidden={tab!=='coefficients'}><span className="fz-panel__h">{t('Koeffitsientlar')}{work && <span className="fz-chip fz-chip--accent">{accepted}</span>}</span>{work ? coefficients : <p className="studio-empty">{t('Avval jadvaldan ish tanlang.')}</p>}</div>
      <div className="fz-panel studio-panel" hidden={tab!=='work'}><span className="fz-panel__h">{t('Hajm')}</span>{workRow ? <Inspector key={`${doc.draftId}:${doc.context.companyId}:${workRow.key}`} doc={doc} row={workRow} labels={studioPanelLabels()} command={command} pricing={pricing}/> : <p className="studio-empty">{t('Avval jadvaldan ish tanlang.')}</p>}</div>
      <div className="fz-panel studio-panel" hidden={tab!=='resources'}><span className="fz-panel__h">{t('Resurs')}<span className="fz-chip">{resourceRows.length}</span></span>
        <label className="studio-resource-choice">{t('Ish tarkibidagi resurs')}<select value={resourceRow?.key ?? ''} onChange={e=>setResourceKey(e.target.value)}><option value="" disabled>{t('Resursni tanlang')}</option>{resourceRows.map(r=><option key={r.key} value={r.key}>{r.code} · {r.label}</option>)}</select></label>
        {resourceRow ? <Inspector resourceOnly key={`${doc.draftId}:${doc.context.companyId}:${resourceRow.key}`} doc={doc} row={resourceRow} labels={studioPanelLabels()} command={command} pricing={pricing}/> : <p className="studio-empty">{t('Bu ishning resurs tarkibi mavjud emas.')}</p>}
      </div>
    </div>
  </aside>;
}
