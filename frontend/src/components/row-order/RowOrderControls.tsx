import { t } from '../../i18n/til';
import { useState } from 'react';

export function moveRow<T>(rows: readonly T[], from: number, to: number): T[] {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= rows.length || to >= rows.length) return [...rows];
  const next = [...rows];
  const [row] = next.splice(from, 1);
  next.splice(to, 0, row);
  return next;
}

/** Zero-based destination in the complete sibling list, including hidden rows. */
export function RowOrderControls({ index, count, label, onMove, disabled = false }: {
  index: number; count: number; label: string; onMove: (destination: number) => void; disabled?: boolean;
}) {
  const [edit, setEdit] = useState<{index:number;count:number;value:string|null}>(()=>({index,count,value:null}));
  const samePosition = edit.index === index && edit.count === count;
  // Discard rather than hide the old input: undo must not resurrect it.
  if (!samePosition) setEdit({index,count,value:null});
  const draft = samePosition ? edit.value : null;
  const setDraft = (value:string|null) => setEdit({index,count,value});
  const destination = Number(draft ?? index + 1);
  const valid = /^\d+$/.test(draft ?? String(index + 1)) && Number.isSafeInteger(destination) && destination >= 1 && destination <= count;
  const unavailable = disabled || index < 0 || index >= count;
  const apply = () => { if (!unavailable && valid && destination !== index + 1) onMove(destination - 1); setDraft(null); };
  const move = (to:number) => { if(!unavailable && to >= 0 && to < count && to !== index){setDraft(null);onMove(to);} };
  return <span role="group" aria-label={t('Qator tartibi: {n}',{n:label})} title={t('Ro‘yxat ichidagi tartib. Alt+↑/↓; Alt+Home/End')} className="inline-flex items-center gap-1 whitespace-nowrap text-xs" onKeyDown={e => { if (['ArrowUp','ArrowDown','Home','End'].includes(e.key)) { e.stopPropagation(); if(e.altKey){e.preventDefault();move(e.key === 'Home' ? 0 : e.key === 'End' ? count-1 : index+(e.key === 'ArrowUp' ? -1 : 1));} } }}>
    <button type="button" className="rounded border px-1 py-1 disabled:opacity-30" aria-label={t('Boshiga: {n}',{n:label})} disabled={unavailable || index === 0} onClick={()=>move(0)}>⇤</button>
    <button type="button" className="rounded border px-1.5 py-1 disabled:opacity-30" aria-label={t('Yuqoriga: {n}',{n:label})} disabled={unavailable || index === 0} onClick={() => { setDraft(null); onMove(index - 1); }}>↑</button>
    <input type="number" min={1} max={count} step={1} aria-label={t('Tartib raqami: {n}',{n:label})} aria-invalid={!valid} disabled={unavailable} className="w-14 rounded border bg-transparent px-1 py-1 text-center tabular-nums" value={draft ?? index + 1} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); apply(); } if (e.key === 'Escape') { e.preventDefault(); setDraft(null); } }} />
    <span className="opacity-60">/ {count}</span>
    <button type="button" className="rounded border px-1.5 py-1 disabled:opacity-30" aria-label={t('Joyiga ko‘chirish: {n}',{n:label})} disabled={unavailable || !valid || destination === index + 1} onClick={apply}>↵</button>
    <button type="button" className="rounded border px-1.5 py-1 disabled:opacity-30" aria-label={t('Pastga: {n}',{n:label})} disabled={unavailable || index === count - 1} onClick={() => { setDraft(null); onMove(index + 1); }}>↓</button>
    <button type="button" className="rounded border px-1 py-1 disabled:opacity-30" aria-label={t('Oxiriga: {n}',{n:label})} disabled={unavailable || index === count - 1} onClick={()=>move(count-1)}>⇥</button>
  </span>;
}
