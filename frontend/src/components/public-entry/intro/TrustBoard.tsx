import { useRef } from 'react';
import { motion } from 'framer-motion';
import { ArrowDown, Lock } from 'lucide-react';
import { raqamFormatla } from '../../../i18n/til';
import type { EntryCopy } from '../product-scope';
import { trustPoints } from '../product-scope';
import { introCopy as c } from './copy';
import { useSeen } from './hooks';

type Local = (s: EntryCopy) => string;

/** The four trust rules as small, self-explaining infographics (captions are the existing trust copy). */
export function TrustBoard({ local }: { local: Local }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useSeen(ref, 0.25);
  const n = (v: number) => raqamFormatla(v);
  const go = (d: number) => ({ initial: { opacity: 0, y: 14 }, animate: seen ? { opacity: 1, y: 0 } : {}, transition: { delay: d, duration: 0.45 } });
  const trace = local(c.tTrace).split(' → ');
  return <div ref={ref} className="entry-trust-board">
    <motion.article {...go(0)}>
      <div className="entry-trust-vis entry-prices">
        <p className="is-info"><span>{local(c.tEstimatePrice)}</span><b>{n(1_248_500)}</b></p>
        <p className="is-accent"><span>{local(c.tF2Price)}</span><b>{n(1_248_500)}</b><Lock size={12} aria-hidden="true" /></p>
        <p className="is-mash"><span>{local(c.tBuyPrice)}</span><b>{n(1_190_000)}</b></p>
      </div>
      <p>{local(trustPoints[0])}</p>
    </motion.article>
    <motion.article {...go(0.1)}>
      <div className="entry-trust-vis entry-revalue">
        <motion.p className="entry-revalue-new" initial={{ y: -6 }} animate={seen ? { y: [-6, 6, -6] } : {}} transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}>
          <span>{local(c.tNewPrice)}</span><b>{n(1_310_000)}</b><ArrowDown size={13} aria-hidden="true" /></motion.p>
        <p className="entry-revalue-shield" aria-hidden="true" />
        <p className="entry-revalue-old"><Lock size={13} aria-hidden="true" /><span>{local(c.tAugust)}</span><b>{n(1_248_500)}</b><em>{local(c.tUnchanged)}</em></p>
      </div>
      <p>{local(trustPoints[1])}</p>
    </motion.article>
    <motion.article {...go(0.2)}>
      <div className="entry-trust-vis entry-unknown">
        <span className="entry-unknown-zero"><b>0</b><motion.i initial={{ scaleX: 0 }} animate={seen ? { scaleX: 1 } : {}} transition={{ delay: 0.7, duration: 0.35 }} /></span>
        <span className="entry-unknown-arrow" aria-hidden="true" />
        <span className="entry-unknown-dash"><b>—</b><em>{local(c.noSource)}</em></span>
      </div>
      <p>{local(trustPoints[2])}</p>
    </motion.article>
    <motion.article {...go(0.3)}>
      <ol className="entry-trust-vis entry-trace">{trace.map((t, i) => <motion.li key={t} initial={{ opacity: 0, x: -8 }} animate={seen ? { opacity: 1, x: 0 } : {}} transition={{ delay: 0.5 + i * 0.16 }}>
        <i className="entry-rhomb" aria-hidden="true" />{t}</motion.li>)}</ol>
      <p>{local(trustPoints[3])}</p>
    </motion.article>
  </div>;
}

/** 300 tokens ≈ 150 F2 acts: 150 girih rhombi light up one by one. */
export function TokenGrid({ local }: { local: Local }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useSeen(ref, 0.3);
  return <figure ref={ref} className="entry-tokens">
    <div className="entry-tokens-grid" aria-hidden="true">{Array.from({ length: 150 }, (_, i) =>
      <motion.i key={i} initial={{ opacity: 0.18, scale: 0.6 }} animate={seen ? { opacity: 1, scale: 1 } : {}} transition={{ delay: 0.2 + (i % 15) * 0.03 + Math.floor(i / 15) * 0.05, duration: 0.3 }} />)}</div>
    <figcaption><b>150</b>{local(c.tokenGrid)}</figcaption>
  </figure>;
}
