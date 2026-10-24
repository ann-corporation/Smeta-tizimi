import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowUpRight, Bot, Box, Calculator, ChartNoAxesColumn, ClipboardList, FileText, Handshake, Layers, ShieldCheck, Sparkles } from 'lucide-react';
import type { EntryCopy } from '../product-scope';
import { L, modules } from './landing-copy';
import { landingPhotos } from './photos';
import './landing.css';

type Loc = (c: EntryCopy) => string;
const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Element ko'rinishga kirganda bir marta true (IntersectionObserver; reduced-motion yoki yo'q bo'lsa darhol true). */
function useInView<T extends HTMLElement>(margin = '0px 0px -12% 0px') {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(() => reduced() || typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const el = ref.current;
    if (seen || !el) return;
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [seen, margin]);
  return [ref, seen] as const;
}

function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  return <div ref={ref} className={`lp-reveal ${seen ? 'is-in' : ''} ${className}`} style={{ transitionDelay: `${delay}ms` }}>{children}</div>;
}

function Icon({ name }: { name: string }) {
  switch (name) {
    case 'calc': return <Calculator size={20} />;
    case 'sparkles': return <Sparkles size={20} />;
    case 'clipboard': return <ClipboardList size={20} />;
    case 'file': return <FileText size={20} />;
    case 'layers': return <Layers size={20} />;
    case 'chart': return <ChartNoAxesColumn size={20} />;
    case 'shield': return <ShieldCheck size={20} />;
    case 'box': return <Box size={20} />;
    case 'handshake': return <Handshake size={20} />;
    default: return <Bot size={20} />;
  }
}

/* ---------- F2 → smeta avto-bog'lash animatsiyasi ---------- */
const f2Rows = [['E6-1-1-1', 'БЕТОННАЯ ПОДГОТОВКА', 'ok'], ['E6-1-97-1', 'УСТАНОВКА АРМАТУРЫ', 'ok'], ['E6-1-1-22', 'ЛЕНТОЧНЫЕ ФУНДАМЕНТЫ', 'review'], ['—', 'ДОП. РАБОТА (ОГРАЖДЕНИЕ)', 'miss']] as const;
const smRows = ['E6-1-1-1 · БЕТОННАЯ ПОДГОТОВКА', 'E6-1-97-1 · УСТАНОВКА АРМАТУРЫ', 'E6-1-1-22 · ФУНДАМЕНТЫ ЛЕНТОЧНЫЕ Ж/Б'];
function F2Demo({ local }: { local: Loc }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  const [step, setStep] = useState(reduced() ? f2Rows.length : 0);
  useEffect(() => {
    if (!seen || reduced()) { if (seen) setStep(f2Rows.length); return; }
    let n = 0; const id = setInterval(() => { n++; setStep(n > f2Rows.length + 2 ? 0 : n); }, 1100);
    return () => clearInterval(id);
  }, [seen]);
  const count = (k: string) => f2Rows.filter((r, i) => i < step && r[2] === k).length;
  const mark = { ok: '✓', review: '◐', miss: '✕' } as const;
  return <div ref={ref} className="lp-demo lp-f2" role="img" aria-label={local(L.f2Title)}>
    <div className="lp-demo-bar"><i /><i /><i /><span>{local(L.sample)}</span></div>
    <div className="lp-f2-grid">
      <div><h4>{local(L.f2Left)}</h4>{f2Rows.map((r, i) => <div key={r[1]} className={`lp-f2-row ${i < step ? 'linked ' + r[2] : ''} ${i === step ? 'active' : ''}`}><b>{r[0]}</b><span>{r[1]}</span><em>{i < step ? mark[r[2]] : ''}</em></div>)}</div>
      <div className="lp-f2-lane" aria-hidden="true">{f2Rows.map((r, i) => <svg key={i} viewBox="0 0 60 20" className={i < step && r[2] !== 'miss' ? 'on' : ''}><path d="M0 10 H48 M42 4 L50 10 L42 16" /></svg>)}</div>
      <div><h4>{local(L.f2Right)}</h4>{smRows.map((s, i) => <div key={s} className={`lp-f2-row sm ${i < step && f2Rows[i][2] !== 'miss' ? 'hit' : ''}`}><span>{s}</span></div>)}</div>
    </div>
    <div className="lp-f2-count"><span className="ok">✓ {count('ok')} <small>{local(L.f2Ok)}</small></span><span className="review">◐ {count('review')} <small>{local(L.f2Review)}</small></span><span className="miss">✕ {count('miss')} <small>{local(L.f2Miss)}</small></span></div>
  </div>;
}

/* ---------- Ustama zanjiri: raqamlar o'sishi ---------- */
const CHAIN = [100_000_000, 4_250_000, 18_765_000, 393_648, 14_809_038];
const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' ');
function ChainDemo({ local }: { local: Loc }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  const [p, setP] = useState(reduced() ? 1 : 0);
  useEffect(() => {
    if (!seen || reduced()) { if (seen) setP(1); return; }
    let raf = 0; const t0 = performance.now(); const dur = 2600;
    const tick = (t: number) => { const x = Math.min(1, (t - t0) / dur); setP(1 - Math.pow(1 - x, 3)); if (x < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [seen]);
  const total = CHAIN.reduce((a, b) => a + b, 0);
  let acc = 0;
  return <div ref={ref} className="lp-demo lp-chain" role="img" aria-label={local(L.chainTitle)}>
    <div className="lp-demo-bar"><i /><i /><i /><span>{local(L.sample)}</span></div>
    <ol>{CHAIN.map((v, i) => { const before = acc; acc += v; const shown = Math.max(0, Math.min(1, p * (CHAIN.length) - i)); return <li key={i} style={{ opacity: .25 + .75 * shown }}>
      <span>{local(L.chain[i])}</span><i style={{ width: `${(v / total) * 100 * shown + 2}%`, marginLeft: `${(before / total) * 100 * p}%` }} /><b>{i ? '+ ' : ''}{fmt(v * shown)}</b></li>; })}</ol>
    <div className="lp-chain-total"><span>{local(L.chainTotal)}</span><strong>{fmt(total * p)} <small>{local(L.chainSom)}</small></strong></div>
  </div>;
}

function Photos({ local }: { local: Loc }) {
  if (!landingPhotos.length) return null;
  return <section className="lp-sec lp-photos" aria-label={local(L.photoTitle)}>
    <Reveal><p className="entry-eyebrow">{local(L.photoEyebrow)}</p><h2>{local(L.photoTitle)}</h2><p className="lp-lead">{local(L.photoNote)}</p></Reveal>
    <div className="lp-photo-grid">{landingPhotos.map((ph, i) => <Reveal key={ph.id} delay={(i % 3) * 80} className={ph.wide ? 'wide' : ''}>
      <figure><picture><source type="image/webp" srcSet={ph.srcSet} sizes="(max-width:760px) 100vw, 40vw" /><img src={ph.src} width={ph.w} height={ph.h} alt={ph.alt} loading="lazy" decoding="async" /></picture></figure></Reveal>)}</div>
  </section>;
}

export default function LandingDeep({ local, onStart, startLabel }: { local: Loc; onStart: () => void; startLabel: string }) {
  return <div className="lp">
    <div className="lp-marquee" aria-hidden="true"><div>{[0, 1].map(k => <span key={k}>{local(L.marquee)} · </span>)}</div></div>
    <section className="lp-sec" id="entry-depth">
      <Reveal><p className="entry-eyebrow">{local(L.depthEyebrow)}</p><h2>{local(L.depthTitle)}</h2><p className="lp-lead">{local(L.depthNote)}</p></Reveal>
    </section>
    <section className="lp-sec lp-split">
      <Reveal className="lp-copy"><p className="entry-eyebrow">{local(L.f2Eyebrow)}</p><h3>{local(L.f2Title)}</h3><p>{local(L.f2Text)}</p></Reveal>
      <Reveal delay={120}><F2Demo local={local} /></Reveal>
    </section>
    <section className="lp-sec lp-split rev">
      <Reveal className="lp-copy"><p className="entry-eyebrow">{local(L.chainEyebrow)}</p><h3>{local(L.chainTitle)}</h3><p>{local(L.chainText)}</p></Reveal>
      <Reveal delay={120}><ChainDemo local={local} /></Reveal>
    </section>
    <Photos local={local} />
    <section className="lp-sec">
      <div className="lp-mods">{modules.map((m, i) => <Reveal key={m.id} delay={(i % 3) * 70}><article className="lp-mod" id={`lp-mod-${m.id}`}>
        <span className="lp-ico"><Icon name={m.icon} /></span><h3>{local(m.title)}</h3><p>{local(m.benefit)}</p>
        <ul>{m.points.map(pt => <li key={pt[0]}>{local(pt)}</li>)}</ul></article></Reveal>)}</div>
    </section>
    <section className="lp-sec lp-keys">
      <Reveal><p className="entry-eyebrow">{local(L.keysEyebrow)}</p><h2>{local(L.keysTitle)}</h2><p className="lp-lead">{local(L.keysText)}</p>
        <button className="entry-primary" onClick={onStart}>{startLabel}<ArrowUpRight size={18} /></button></Reveal>
    </section>
  </div>;
}
