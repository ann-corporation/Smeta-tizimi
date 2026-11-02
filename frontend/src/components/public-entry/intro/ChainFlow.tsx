import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useMotionValueEvent, useScroll, useTransform, type MotionValue } from 'framer-motion';
import { Lock } from 'lucide-react';
import type { EntryCopy } from '../product-scope';
import { introCopy as c } from './copy';
import { useScrollStory, useSeen, num } from './hooks';

type Local = (s: EntryCopy) => string;
const st = (id: string, title: EntryCopy, caption: EntryCopy) => ({ id, title, caption });
const chainStations = [
  st('smeta', ['Smeta', 'Смета', 'Estimate'], ['Hajm va narx smetadan olinadi', 'Объём и цена берутся из сметы', 'Quantity and price come from the estimate']),
  st('fakt', ['Fakt', 'Факт', 'Progress'], ['Bajarilgan hajm har kuni yoziladi', 'Выполненный объём фиксируется ежедневно', 'Completed quantities are logged daily']),
  st('f2', ['F2', 'Ф2', 'F2'], ['Oylik akt fakt qoldig‘idan tayyorlanadi', 'Месячный акт готовится из остатка факта', 'The monthly act is prepared from remaining progress']),
  st('nak', ['Nakopitelniy', 'Накопительная', 'Cumulative'], ['Tasdiqlangan aktlar yig‘iladi', 'Утверждённые акты накапливаются', 'Approved acts accumulate']),
  st('f3', ['F3', 'Ф3', 'F3'], ['Hisob-faktura shu aktdan tuziladi', 'Счёт-фактура строится из этого акта', 'The invoice is built from this act']),
  st('pay', ['To‘lov', 'Оплата', 'Payment'], ['To‘lov aktga bog‘lanadi', 'Оплата привязана к акту', 'Payment is tied to the act']),
] as const;

const PRICE = 1_248_500, PLAN = 120, PREV = 74.4, ACT = 36, MARKUP = 1.3216;
const ACT_SUM = ACT * PRICE, ACT_SUM_M = Math.round(ACT_SUM * MARKUP), PAID = 40_000_000;
const DAYS = [4, 6, 3, 5, 4, 6, 4, 4];
const STATUSES = [c.statusDraft, c.statusSent, c.statusChecked, c.statusApproved];

/** Smeta → Fakt → F2 → Nakopitelniy → F3 → To‘lov: one quantity flowing through, scroll-scrubbed on large screens. */
export function ChainFlow({ local, children }: { local: Local; children?: ReactNode }) {
  const story = useScrollStory();
  return story ? <ChainScroll local={local}>{children}</ChainScroll> : <ChainStatic local={local}>{children}</ChainStatic>;
}

function ChainScroll({ local, children }: { local: Local; children?: ReactNode }) {
  const wrap = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: wrap, offset: ['start start', 'end end'] });
  const [active, setActive] = useState(-1);
  const [f2Step, setF2Step] = useState(0);
  useMotionValueEvent(scrollYProgress, 'change', p => {
    const a = p < 0.04 ? -1 : Math.min(5, Math.floor(((p - 0.04) / 0.9) * 6));
    setActive(a);
    const local2 = ((p - 0.04) / 0.9) * 6 - 2; // 0..1 inside the F2 window
    setF2Step(a > 2 ? 3 : a < 2 ? 0 : Math.min(3, Math.floor(local2 * 4.6)));
  });
  return <div ref={wrap} className="entry-chainflow-wrap is-scroll">
    <div className="entry-chainflow-sticky">
      <Header local={local}>{children}</Header>
      <Track progress={scrollYProgress} active={active} local={local} />
      <Stations local={local} active={active} f2Step={f2Step} />
    </div>
  </div>;
}

function ChainStatic({ local, children }: { local: Local; children?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useSeen(ref, 0.3);
  const [f2Step, setF2Step] = useState(0);
  useEffect(() => {
    if (!seen) return;
    const ids = [1, 2, 3].map(n => setTimeout(() => setF2Step(n), 450 + n * 520));
    return () => ids.forEach(clearTimeout);
  }, [seen]);
  return <div ref={ref} className="entry-chainflow-wrap is-static">
    <Header local={local}>{children}</Header>
    <Stations local={local} active={5} f2Step={f2Step} />
  </div>;
}

function Header({ local, children }: { local: Local; children?: ReactNode }) {
  return <div className="entry-chainflow-head">
    <div><p className="entry-eyebrow"><i className="entry-rhomb" aria-hidden="true" />{local(c.chainEyebrow)}</p>
      <h2 id="entry-chain-title">{local(c.chainTitle)}</h2></div>
    <p className="entry-section-description">{local(c.chainNote)}</p>
    {children}
  </div>;
}

function Track({ progress, active, local }: { progress: MotionValue<number>; active: number; local: Local }) {
  const fill = useTransform(progress, [0.04, 0.94], [0, 1]);
  const left = useTransform(progress, [0.04, 0.94], ['8.33%', '91.67%']);
  return <div className="entry-track" aria-hidden="true">
    <div className="entry-track-line"><motion.i style={{ scaleX: fill }} /></div>
    {chainStations.map((s, i) => <span key={s.id} className="entry-track-node" data-on={i <= active} style={{ left: `${(i + 0.5) * (100 / 6)}%` }} />)}
    <motion.span className="entry-track-token" style={{ left }}><b>{num(ACT)} м³</b><small>{local(c.rowName)}</small></motion.span>
  </div>;
}

function Stations({ local, active, f2Step }: { local: Local; active: number; f2Step: number }) {
  const n = (v: number, d = 0) => num(v, d);
  const sum = local(c.sum);
  const body = (id: string): ReactNode => {
    switch (id) {
      case 'smeta': return <>
      <code className="entry-code">E6-1-1-22</code>
      <p className="entry-big">{n(PLAN)}<small>м³</small></p>
      <dl className="entry-pair"><dt>{local(c.withoutMarkup)}</dt><dd>{n(PLAN * PRICE)}</dd></dl>
    </>;
      case 'fakt': return <>
      <p className="entry-mini-label">{local(c.octDays)}</p>
      <div className="entry-days" aria-hidden="true">{DAYS.map((d, i) => <motion.i key={i} initial={{ scaleY: 0.1 }} animate={{ scaleY: active >= 1 ? d / 6 : 0.1 }} transition={{ delay: i * 0.05, type: 'spring', stiffness: 220, damping: 20 }} />)}</div>
      <p className="entry-big">+{n(ACT)}<small>м³</small></p>
    </>;
      case 'f2': return <>
      <ol className="entry-status" aria-label={local(c.approvalPath)}>{STATUSES.map((s, i) => <li key={s[0]} data-on={active >= 2 && f2Step >= i}>{local(s)}</li>)}</ol>
      <p className="entry-big">{n(ACT)}<small>м³</small></p>
      <dl className="entry-pair"><dt>{local(c.withoutMarkup)}</dt><dd>{n(ACT_SUM)}</dd><dt>{local(c.withMarkup)}</dt><dd>{n(ACT_SUM_M)}</dd></dl>
    </>;
      case 'nak': return <>
      <div className="entry-stack" aria-hidden="true">
        <motion.i className="is-prev" initial={{ width: 0 }} animate={{ width: active >= 3 ? `${(PREV / PLAN) * 100}%` : 0 }} transition={{ duration: 0.7 }} />
        <motion.i className="is-act" initial={{ width: 0 }} animate={{ width: active >= 3 ? `${(ACT / PLAN) * 100}%` : 0 }} transition={{ duration: 0.7, delay: 0.35 }} />
      </div>
      <p className="entry-big">{n(Math.round(((PREV + ACT) / PLAN) * 100))}<small>% {local(c.ofEstimate)}</small></p>
      <dl className="entry-pair"><dt>{local(c.prevActs)}</dt><dd>{n(PREV, 1)} м³</dd><dt>{local(c.thisAct)}</dt><dd>{n(ACT)} м³</dd></dl>
    </>;
      case 'f3': return <>
      <p className="entry-mini-label">{local(c.invoice)} · 10/26</p>
      <p className="entry-big entry-big--money">{n(ACT_SUM_M)}<small>{sum}</small></p>
      <dl className="entry-pair"><dt>{local(c.withoutMarkup)}</dt><dd>{n(ACT_SUM)}</dd></dl>
    </>;
      case 'pay': return <>
      <div className="entry-stack" aria-hidden="true"><motion.i className="is-ok" initial={{ width: 0 }} animate={{ width: active >= 5 ? `${(PAID / ACT_SUM_M) * 100}%` : 0 }} transition={{ duration: 0.8 }} /></div>
      <dl className="entry-pair"><dt>{local(c.paid)}</dt><dd>{n(PAID)}</dd><dt>{local(c.due)}</dt><dd className="is-warn">{n(ACT_SUM_M - PAID)}</dd></dl>
    </>;
      default: return null;
    }
  };
  const stamped = active >= 2 && f2Step >= 3;
  return <ol className="entry-stations">{chainStations.map((s, i) => <li key={s.id} className={`entry-station entry-station--${s.id}`} data-on={i <= active} data-frozen={s.id === 'f2' && stamped}>
    <header><span className="entry-station-no">0{i + 1}</span><h3>{local(s.title)}</h3></header>
    <p className="entry-station-caption">{local(s.caption)}</p>
    <div className="entry-station-body">{body(s.id)}</div>
    {s.id === 'f2' && <AnimatePresence>{stamped && <>
      <motion.span key="stamp" className="entry-stamp" initial={{ opacity: 0, scale: 2.6, rotate: -16 }} animate={{ opacity: 1, scale: 1, rotate: -4 }} exit={{ opacity: 0, scale: 1.3 }}
        transition={{ type: 'spring', stiffness: 520, damping: 17, mass: 0.8 }}>{local(c.approved)}</motion.span>
      <motion.span key="ring" className="entry-stamp-ring" aria-hidden="true" initial={{ opacity: 0.7, scale: 0.4 }} animate={{ opacity: 0, scale: 1.8 }} transition={{ duration: 0.7, delay: 0.08 }} />
      <motion.p key="frozen" className="entry-frozen" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}><Lock size={12} aria-hidden="true" />{local(c.frozen)}</motion.p>
    </>}</AnimatePresence>}
  </li>)}</ol>;
}
