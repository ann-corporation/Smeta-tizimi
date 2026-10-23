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
  const [draft, setDraft] = useState<string | null>(null);
  const destination = Number(draft ?? index + 1);
  const valid = /^\d+$/.test(draft ?? String(index + 1)) && Number.isSafeInteger(destination) && destination >= 1 && destination <= count;
  const unavailable = disabled || index < 0 || index >= count;
  const apply = () => { if (!unavailable && valid && destination !== index + 1) onMove(destination - 1); setDraft(null); };
  return <span role="group" aria-label={`Qator tartibi: ${label}`} className="inline-flex items-center gap-1 whitespace-nowrap text-xs" onKeyDown={e => { if (e.key.startsWith('Arrow')) e.stopPropagation(); }}>
    <button type="button" className="rounded border px-1.5 py-1 disabled:opacity-30" aria-label={`Yuqoriga: ${label}`} disabled={unavailable || index === 0} onClick={() => { setDraft(null); onMove(index - 1); }}>↑</button>
    <input type="number" min={1} max={count} step={1} aria-label={`Tartib raqami: ${label}`} aria-invalid={!valid} disabled={unavailable} className="w-14 rounded border bg-transparent px-1 py-1 text-center tabular-nums" value={draft ?? index + 1} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); apply(); } if (e.key === 'Escape') { e.preventDefault(); setDraft(null); } }} />
    <span className="opacity-60">/ {count}</span>
    <button type="button" className="rounded border px-1.5 py-1 disabled:opacity-30" aria-label={`Joyiga ko‘chirish: ${label}`} disabled={unavailable || !valid || destination === index + 1} onClick={apply}>↵</button>
    <button type="button" className="rounded border px-1.5 py-1 disabled:opacity-30" aria-label={`Pastga: ${label}`} disabled={unavailable || index === count - 1} onClick={() => { setDraft(null); onMove(index + 1); }}>↓</button>
  </span>;
}
