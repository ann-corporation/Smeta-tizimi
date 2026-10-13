import { useState } from 'react';
import { ArrowUpRight, ChevronLeft, ChevronRight } from 'lucide-react';

export type ProductScreenshot = { src: string; alt: string; caption: string };
export function ProductShowcase({ screens, title, note, expand, close, start, onStart }: {
  screens: readonly ProductScreenshot[]; title: string; note: string; expand: string; close: string; start: string; onStart: () => void;
}) {
  const [selected, setSelected] = useState(0);
  const current = screens[selected] ?? screens[0];
  if (!current) return null;
  const move = (delta: number) => setSelected((selected + delta + screens.length) % screens.length);
  return <section id="entry-screens" className="entry-section entry-showcase" aria-label={title}>
    <div className="entry-showcase-heading"><div><p className="entry-eyebrow">TIZIM_02 · {note}</p><h2>{title}</h2></div><button className="entry-secondary" onClick={onStart}>{start}<ArrowUpRight size={18} /></button></div>
    <div className="entry-screen-options" role="group" aria-label={title}>{screens.map((s, i) => <button key={s.src} aria-pressed={i === selected} onClick={() => setSelected(i)}><span>0{i + 1}</span>{s.alt}</button>)}</div>
    <figure className="entry-screen-stage">
      <div className="entry-screen-chrome" aria-hidden="true"><span /><span /><span /><b>TIZIM_02</b></div>
      <div className="entry-screen-image"><img src={current.src} alt={current.alt} loading="lazy" decoding="async" /></div>
      <figcaption><div><strong>{current.alt}</strong><p>{current.caption}</p></div><div className="entry-screen-controls"><button onClick={() => move(-1)} aria-label={screens[(selected - 1 + screens.length) % screens.length].alt}><ChevronLeft size={19} /></button><span>{selected + 1} / {screens.length}</span><button onClick={() => move(1)} aria-label={screens[(selected + 1) % screens.length].alt}><ChevronRight size={19} /></button></div></figcaption>
    </figure>
    <details className="entry-screen-enlarge"><summary>{expand}</summary><p>{close}</p><img src={current.src} alt={`${current.alt} — ${expand}`} loading="lazy" decoding="async" /></details>
  </section>;
}
