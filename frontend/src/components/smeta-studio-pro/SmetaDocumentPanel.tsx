import { useEffect, useRef, useState } from 'react';
import type { EstimateDoc } from '../../lib/smeta-studio/model';
import type { Totals, DocCalc } from '../../lib/smeta-studio/calc';
import type { StudioCommand } from '../../lib/smeta-studio/commands';
import { EstimateEditingWorkspace, type EditingLabels, type PricingProps } from './EstimateEditingWorkspace';

export type DocumentPanelLabels = EditingLabels & {
  object: string; documentTitle: string; currency: string; newSection: string; subsection: string;
  targetSection: string; knownAmount: string; unresolved: string;
};

/** Drop-in right panel. Catalog, autosave, save/undo and authorization remain owned by the parent. */
export function SmetaDocumentPanel({ doc, total, targetSectionId, setTargetSection, command, labels: l,
  calculation, pricing, createId = () => crypto.randomUUID() }: {
  doc: EstimateDoc; total: Totals; targetSectionId: string | null;
  setTargetSection: (id: string | null) => void;
  command: (command: StudioCommand) => boolean; labels: DocumentPanelLabels; createId?: () => string;
  calculation?: DocCalc;
  pricing?: PricingProps;
}) {
  const [sectionName, setSectionName] = useState('');
  const [nested, setNested] = useState(false);
  const [failed, setFailed] = useState(false);
  const [context, setContext] = useState({ objectLabel: doc.context.objectLabel, title: doc.context.title, currency: doc.currency });
  const scope = JSON.stringify([doc.draftId, doc.context.companyId, doc.context.projectId, doc.context.objectId]);
  const previousScope = useRef(scope);
  useEffect(() => {
    if (previousScope.current !== scope) { previousScope.current = scope; setTargetSection(null); }
  }, [scope, setTargetSection]);
  useEffect(() => { setSectionName(''); setNested(false); setFailed(false); }, [scope]);
  useEffect(() => { setContext({ objectLabel: doc.context.objectLabel, title: doc.context.title, currency: doc.currency }); },
    [doc.context.objectLabel, doc.context.title, doc.currency, scope]);
  const target = targetSectionId ? doc.sections[targetSectionId] : null;
  function run(c: StudioCommand): boolean {
    try { const ok = command(c); setFailed(!ok); return ok; } catch { setFailed(true); return false; }
  }
  return <section className="min-w-0 space-y-3" aria-label={l.title}>
    <form className="grid items-end gap-2 md:grid-cols-[1fr_1fr_80px_auto]" onSubmit={e => {
      e.preventDefault(); run({ type: 'SET_CONTEXT', context: { objectLabel: context.objectLabel, title: context.title }, currency: context.currency });
    }}>
      <label className="block text-[11.5px] text-text-dim">{l.object}<input className="input mt-0.5 h-8 w-full text-[12.5px]" value={context.objectLabel} onChange={e => setContext(old => ({ ...old, objectLabel: e.target.value }))} /></label>
      <label className="block text-[11.5px] text-text-dim">{l.documentTitle}<input className="input mt-0.5 h-8 w-full text-[12.5px]" value={context.title} onChange={e => setContext(old => ({ ...old, title: e.target.value }))} /></label>
      <label className="block text-[11.5px] text-text-dim">{l.currency}<input className="input mt-0.5 h-8 w-full text-[12.5px]" maxLength={3} value={context.currency} onChange={e => setContext(old => ({ ...old, currency: e.target.value.toUpperCase() }))} /></label>
      <button type="submit" className="tugma tugma-asosiy mt-1 h-7 px-2 text-[11.5px]">{l.save}</button>
    </form>
    <div className="karta p-2 text-sm" role="status">
      <strong>{l.amount}: {total.amount ?? l.unknown} {doc.currency}</strong>
      {total.amount == null && <p className="text-[12px] text-text-dim">{l.knownAmount}: {total.knownAmount} · {l.unresolved}: {total.unresolved}</p>}
      <p className="text-[12px] text-text-dim">{l.targetSection}: {target?.name ?? l.choose}</p>
    </div>
    {failed && <p role="alert" className="text-sm text-danger">{l.failed}</p>}
    <form className="flex flex-wrap items-end gap-2" onSubmit={e => {
      e.preventDefault(); if (!sectionName.trim() || (nested && !target)) { setFailed(true); return; }
      const id = createId();
      if (run({ type: 'ADD_SECTION', sectionId: id, parentId: nested ? target!.id : null, name: sectionName })) {
        setTargetSection(id); setSectionName('');
      }
    }}>
      <label className="block text-[11.5px] text-text-dim">{l.newSection}<input className="input mt-0.5 h-8 text-[12.5px]" maxLength={300} value={sectionName} onChange={e => setSectionName(e.target.value)} /></label>
      <label className="block text-[11.5px] text-text-dim"><input type="checkbox" checked={nested} disabled={!target} onChange={e => setNested(e.target.checked)} />{l.subsection}</label>
      <button type="submit" className="tugma tugma-asosiy mt-1 h-7 px-2 text-[11.5px]" disabled={!sectionName.trim() || (nested && !target)}>{l.save}</button>
    </form>
    <EstimateEditingWorkspace key={scope} doc={doc} labels={l} command={command} calculation={calculation} pricing={pricing} onTargetSection={setTargetSection} />
  </section>;
}
