import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { EntryCopy } from '../product-scope';
import { introCopy as c } from './copy';
import { useSeen, num } from './hooks';

type Local = (s: EntryCopy) => string;
const SCALE = 115; // meter spans 0..115% so over-limit has room past the 100% line
const pct = (v: number) => `${(v / SCALE) * 100}%`;
const MARKUP = 1.3216;
const lines = [
  { id: 'found', code: 'E6-1-1-22', name: c.rowName, unit: 'м³', plan: 120, prev: 74.4, act: 36, price: 1_248_500, digits: 1 },
  { id: 'rebar', code: 'E6-1-97-1', name: c.rebar, unit: 'т', plan: 1.85, prev: 1.4, act: 0.58, price: 9_860_000, digits: 2 },
] as const;
const notes = [c.a1, c.a2, c.a3, c.a4, c.a5];
const DOC_TITLE = 'F2 · 10/2026 · № 10';

/** One F2 line explained: estimate = 100%, earlier certified, this act, over-limit, two money forms — with numbered callouts. */
export function F2Anatomy({ local }: { local: Local }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useSeen(ref, 0.3);
  const [focus, setFocus] = useState<number | null>(null);
  const n = (v: number, d = 2) => num(v, d);
  return <div ref={ref} className="entry-f2" data-focus={focus ?? undefined}>
    <div className="entry-f2-doc">
      <div className="entry-f2-doc-head"><b>{DOC_TITLE}</b><span className="entry-pill entry-pill--ok">{local(c.statusApproved)}</span><span className="entry-sheet-sample">{local(c.sample)}</span></div>
      <div className="entry-f2-cols" aria-hidden="true">
        <span>{local(c.colCode)}</span><span>{local(c.colWork)}</span><span>{local(c.colEstimate)}</span><span>{local(c.colPrev)}</span><span>{local(c.colAct)}</span><span>{local(c.colLeft)}</span><span>{local(c.colSum)}</span>
      </div>
      {lines.map((l, li) => {
        const left = l.plan - l.prev - l.act, over = left < 0;
        const sum = l.act * l.price;
        const prevP = (l.prev / l.plan) * 100, actP = (l.act / l.plan) * 100;
        return <div key={l.id} className={`entry-f2-line ${over ? 'is-over' : ''}`}>
          <div className="entry-f2-cells">
            <code>{l.code}</code>
            <span className="entry-f2-name">{local(l.name)}<i>{l.unit}</i></span>
            <span data-label={local(c.colEstimate)}>{n(l.plan)}</span>
            <span data-label={local(c.colPrev)} className="is-prev">{n(l.prev)}</span>
            <span data-label={local(c.colAct)} className="is-act">{n(l.act)}</span>
            <span data-label={local(c.colLeft)} className={over ? 'is-over' : ''}>{over ? `−${n(-left)}` : n(left)}</span>
            <span className="entry-f2-sum" data-label={local(c.colSum)}>
              <b>{n(sum, 0)}</b><small>{local(c.withoutMarkup)}</small>
              <b>{n(Math.round(sum * MARKUP), 0)}</b><small>{local(c.withMarkup)}</small>
              {li === 0 && <F2Marker focus={focus} seen={seen} i={4} className="entry-marker--sum" />}
            </span>
          </div>
          <div className="entry-f2-meter">
            <div className="entry-f2-bar">
              <motion.i className="is-prev" style={{ left: 0 }} initial={{ width: 0 }} animate={{ width: seen ? pct(Math.min(prevP, 100)) : 0 }} transition={{ duration: 0.8, delay: 0.2 + li * 0.25 }} />
              <motion.i className="is-act" style={{ left: pct(prevP) }} initial={{ width: 0 }} animate={{ width: seen ? pct(Math.min(actP, 100 - prevP)) : 0 }} transition={{ duration: 0.7, delay: 0.75 + li * 0.25 }} />
              {over && <motion.i className="is-over" style={{ left: pct(100) }} initial={{ width: 0 }} animate={{ width: seen ? pct(prevP + actP - 100) : 0 }} transition={{ duration: 0.5, delay: 1.3 }} />}
              <span className="entry-f2-limit" style={{ left: pct(100) }}>{li === 0 && <em>100%</em>}</span>
              {li === 0 && <><F2Marker focus={focus} seen={seen} i={0} className="entry-marker--limit" /><span className="entry-marker-slot" style={{ left: pct(prevP / 2) }}><F2Marker focus={focus} seen={seen} i={1} /></span><span className="entry-marker-slot" style={{ left: pct(prevP + actP / 2) }}><F2Marker focus={focus} seen={seen} i={2} /></span></>}
              {over && <span className="entry-marker-slot" style={{ left: pct(100 + (prevP + actP - 100) / 2) }}><F2Marker focus={focus} seen={seen} i={3} /></span>}
            </div>
            <span className={`entry-f2-total ${over ? 'is-over' : ''}`}>{n(prevP + actP, 0)}%{over && <small>{local(c.overLimit)}</small>}</span>
          </div>
        </div>;
      })}
    </div>
    <ol className="entry-f2-notes">{notes.map((note, i) => <motion.li key={note[0]} tabIndex={0} data-focus={focus === i}
      onMouseEnter={() => setFocus(i)} onMouseLeave={() => setFocus(null)} onFocus={() => setFocus(i)} onBlur={() => setFocus(null)}
      initial={{ opacity: 0, x: 16 }} animate={seen ? { opacity: 1, x: 0 } : {}} transition={{ delay: 0.9 + i * 0.12, duration: 0.4 }}>
      <span className="entry-marker entry-marker--static" aria-hidden="true"><b>{i + 1}</b></span>{local(note)}
    </motion.li>)}</ol>
  </div>;
}

function F2Marker({ i, className = '', focus, seen }: { i: number; className?: string; focus: number | null; seen: boolean }) {
  return <motion.span className={`entry-marker ${className}`} data-focus={focus === i} aria-hidden="true"
    initial={{ scale: 0, opacity: 0 }} animate={seen ? { scale: 1, opacity: 1 } : {}} transition={{ type: 'spring', stiffness: 420, damping: 16, delay: 1 + i * 0.18 }}><b>{i + 1}</b></motion.span>;
}
