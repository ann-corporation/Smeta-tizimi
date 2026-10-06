import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { ReactNode } from 'react';
import type { EstimateDoc } from '../../lib/smeta-studio/model';
import { expandThroughDepth, indexEstimate, outlineBreadcrumb, visibleOutline, type OutlineRow } from './hierarchy';

/** Caller supplies localized UI text and existing command/inspector handlers; no API/DB calls here. */
export type OutlineLabels = {
  title: string; search: string; collapse: string; sections: string; works: string; resources: string;
  empty: string; invalid: string; select: string; expand: string; close: string;
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
  const seenKeys = useRef<Set<string> | null>(null);
  const revealKey = useRef<string | null>(null);
  useEffect(() => {
    const previous = seenKeys.current;
    seenKeys.current = new Set(parsed.index.byKey.keys());
    if (!previous || !parsed.valid) return;
    // Reveal newly added rows, without reopening branches on price/quantity edits.
    const reveal = new Set<string>();
    for (const row of parsed.index.rows) if (!previous.has(row.key)) {
      if (row.kind === 'section') reveal.add(row.key);
      if (row.kind === 'work' && !revealKey.current) revealKey.current = row.key;
      if (row.parentKey) reveal.add(row.parentKey);
    }
    if (!reveal.size) return;
    if (revealKey.current) setQuery('');
    for (let i = parsed.index.rows.length - 1; i >= 0; i--) {
      const row = parsed.index.rows[i];
      if (reveal.has(row.key) && row.parentKey) reveal.add(row.parentKey);
    }
    setOpen(old => new Set([...old].filter(k => parsed.index.byKey.has(k)).concat([...reveal])));
  }, [parsed]);
  const deferred = useDeferredValue(query);
  const rows = useMemo(() => visibleOutline(parsed.index, open, deferred), [parsed.index, open, deferred]);
  const parent = useRef<HTMLDivElement>(null);
  const virtual = useVirtualizer({ count: rows.length, getScrollElement: () => parent.current,
    estimateSize: () => 44, overscan: 8, initialRect: { width: 1000, height: 520 }, getItemKey: i => rows[i].key });
  useEffect(() => {
    if (!revealKey.current) return;
    const index = rows.findIndex(row => row.key === revealKey.current);
    if (index < 0) return;
    virtual.scrollToIndex(index, { align: 'auto' });
    revealKey.current = null;
  }, [rows, virtual]);
  const levels = (depth: number) => { setQuery(''); setOpen(expandThroughDepth(parsed.index, depth)); virtual.scrollToOffset(0); };
  return <section aria-label={labels.title} className="rounded-xl border border-slate-700 bg-slate-950 text-slate-100">
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-700 p-3">
      <strong className="mr-auto">{labels.title}</strong>
      <button type="button" onClick={() => levels(0)}>{labels.collapse}</button>
      <button type="button" onClick={() => levels(1)}>{labels.sections}</button>
      <button type="button" onClick={() => { setQuery(''); setOpen(new Set(parsed.index.rows.filter(r => r.kind === 'section' && r.expandable).map(r => r.key))); virtual.scrollToOffset(0); }}>{labels.works}</button>
      <button type="button" onClick={() => levels(Infinity)}>{labels.resources}</button>
      <input aria-label={labels.search} placeholder={labels.search} value={query} maxLength={200}
        className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2"
        onChange={event => { setQuery(event.target.value); virtual.scrollToOffset(0); }} />
    </div>
    {!parsed.valid ? <p role="alert" className="p-4 text-amber-300">{labels.invalid}</p> :
      rows.length === 0 ? <p className="p-4">{labels.empty}</p> :
        <div ref={parent} role="tree" aria-label={labels.title} className="h-[520px] overflow-auto" style={{ contain: 'strict' }}>
          <div style={{ height: virtual.getTotalSize(), width: '100%', position: 'relative' }}>
            {virtual.getVirtualItems().map(item => {
              const row = rows[item.index];
              return <div key={row.key} role="treeitem" aria-level={row.depth + 1} aria-selected={selected === row.key}
                aria-expanded={row.expandable ? open.has(row.key) || Boolean(deferred.trim()) : undefined}
                title={outlineBreadcrumb(parsed.index, row).join(' → ')}
                className={`flex items-center gap-2 border-b border-slate-800 px-3 ${selected === row.key ? 'bg-blue-950 ring-1 ring-inset ring-blue-500' : row.kind === 'section' ? 'bg-slate-800 font-semibold' : 'bg-slate-950'}`}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: 44,
                  transform: `translateY(${item.start}px)`, paddingLeft: 12 + Math.min(row.depth, 12) * 16 }}>
                {row.expandable ? <button type="button" disabled={Boolean(deferred.trim())} aria-label={open.has(row.key) || Boolean(deferred.trim()) ? labels.close : labels.expand}
                  onClick={() => setOpen(old => { const next = new Set(old); if (next.has(row.key)) next.delete(row.key); else next.add(row.key); return next; })}>
                  {open.has(row.key) || Boolean(deferred.trim()) ? '▾' : '▸'}</button> : <span className="w-3" />}
                <button type="button" aria-label={`${labels.select}: ${row.label || row.code || ''}`}
                  className="min-w-0 flex-1 truncate text-left" onClick={() => { setSelected(row.key); onSelect(row); }}>
                  {row.code && <span className="mr-2 text-slate-400">{row.code}</span>}{row.label}
                </button>
                {renderSummary && <span className="shrink-0 text-xs tabular-nums">{renderSummary(row)}</span>}
              </div>;
            })}
          </div>
        </div>}
  </section>;
}
