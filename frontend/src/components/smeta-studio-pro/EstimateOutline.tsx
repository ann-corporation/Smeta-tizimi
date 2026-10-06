import { useDeferredValue, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { ReactNode } from 'react';
import type { EstimateDoc } from '../../lib/smeta-studio/model';
import { expandThroughDepth, indexEstimate, outlineBreadcrumb, visibleOutline, type OutlineRow } from './hierarchy';

/** Caller supplies localized UI text and existing command/inspector handlers; no API/DB calls here. */
export type OutlineLabels = {
  title: string; search: string; collapse: string; sections: string; works: string; resources: string;
  empty: string; invalid: string; select: string; expand: string; close: string;
};
const ROW_H = 32;
/** Same visual grouping as the F2 workbench: each work starts with a strong top line, its resources carry a left bar. */
const ROW_TONE: Record<OutlineRow['kind'], string> = {
  section: 'bg-surface-2 font-semibold text-text',
  work: 'border-t-2 border-t-sky-400/70 font-medium text-text hover:bg-surface-2/60',
  resource: 'shadow-[inset_4px_0_0_0_rgba(56,189,248,0.45)] text-text-dim hover:bg-surface-2/60',
};
export function EstimateOutline({ doc, labels, onSelect, renderSummary }: {
  doc: EstimateDoc; labels: OutlineLabels; onSelect: (row: OutlineRow) => void;
  renderSummary?: (row: OutlineRow) => ReactNode;
}) {
  // IDs remain internal; selection reports IDs, while visible names/codes stay professional.
  const parsed = useMemo(() => {
    try { return { index: indexEstimate(doc), valid: true }; }
    catch { return { index: { rows: [], byKey: new Map<string, number>() }, valid: false }; }
  }, [doc]);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const deferred = useDeferredValue(query);
  const rows = useMemo(() => visibleOutline(parsed.index, open, deferred), [parsed.index, open, deferred]);
  const parent = useRef<HTMLDivElement>(null);
  const virtual = useVirtualizer({ count: rows.length, getScrollElement: () => parent.current,
    estimateSize: () => ROW_H, overscan: 8, initialRect: { width: 1000, height: 520 }, getItemKey: i => rows[i].key });
  const levels = (depth: number) => { setQuery(''); setOpen(expandThroughDepth(parsed.index, depth)); virtual.scrollToOffset(0); };
  return <section aria-label={labels.title} className="karta overflow-hidden p-0">
    <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-surface-2/60 px-2 py-1.5">
      <strong className="mr-auto text-[11px] font-semibold uppercase tracking-wide text-text-dim">{labels.title}</strong>
      <button type="button" className="tugma h-6 px-1.5 text-[10.5px]" onClick={() => levels(0)}>{labels.collapse}</button>
      <button type="button" className="tugma h-6 px-1.5 text-[10.5px]" onClick={() => levels(1)}>{labels.sections}</button>
      <button type="button" className="tugma h-6 px-1.5 text-[10.5px]" onClick={() => { setQuery(''); setOpen(new Set(parsed.index.rows.filter(r => r.kind === 'section' && r.expandable).map(r => r.key))); virtual.scrollToOffset(0); }}>{labels.works}</button>
      <button type="button" className="tugma h-6 px-1.5 text-[10.5px]" onClick={() => levels(Infinity)}>{labels.resources}</button>
      <input aria-label={labels.search} placeholder={labels.search} value={query} maxLength={200}
        className="input h-7 w-full text-[12px]"
        onChange={event => { setQuery(event.target.value); virtual.scrollToOffset(0); }} />
    </div>
    {!parsed.valid ? <p role="alert" className="p-4 text-warn">{labels.invalid}</p> :
      rows.length === 0 ? <p className="p-4 text-sm text-text-dim">{labels.empty}</p> :
        <div ref={parent} role="tree" aria-label={labels.title} className="h-[calc(100vh-330px)] min-h-[360px] overflow-auto" style={{ contain: 'strict' }}>
          <div style={{ height: virtual.getTotalSize(), width: '100%', position: 'relative' }}>
            {virtual.getVirtualItems().map(item => {
              const row = rows[item.index];
              return <div key={row.key} role="treeitem" aria-level={row.depth + 1} aria-selected={selected === row.key}
                aria-expanded={row.expandable ? open.has(row.key) || Boolean(deferred.trim()) : undefined}
                title={outlineBreadcrumb(parsed.index, row).join(' → ')}
                className={`flex items-center gap-1.5 border-b border-border/50 pr-2 text-[12px] ${selected === row.key ? 'bg-accent/15 outline outline-1 -outline-offset-1 outline-accent' : ROW_TONE[row.kind]}`}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: ROW_H,
                  transform: `translateY(${item.start}px)`, paddingLeft: 6 + Math.min(row.depth, 12) * 14 }}>
                {row.expandable ? <button type="button" disabled={Boolean(deferred.trim())} aria-label={open.has(row.key) || Boolean(deferred.trim()) ? labels.close : labels.expand}
                  onClick={() => setOpen(old => { const next = new Set(old); if (next.has(row.key)) next.delete(row.key); else next.add(row.key); return next; })}>
                  {open.has(row.key) || Boolean(deferred.trim()) ? '▾' : '▸'}</button> : <span className="w-3" />}
                <button type="button" aria-label={`${labels.select}: ${row.label || row.code || ''}`}
                  className="min-w-0 flex-1 truncate text-left" onClick={() => { setSelected(row.key); onSelect(row); }}>
                  {row.code && <span className="mr-2 font-mono text-[11px] text-accent">{row.code}</span>}{row.label}
                </button>
                {renderSummary && <span className="shrink-0 text-right text-[11.5px] tabular-nums text-text-dim">{renderSummary(row)}</span>}
              </div>;
            })}
          </div>
        </div>}
  </section>;
}
