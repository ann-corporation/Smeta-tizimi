import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion, motionValue, useMotionValueEvent, useTransform, type MotionValue } from 'framer-motion';
import { AlertTriangle, FileSpreadsheet, Sparkles } from 'lucide-react';
import { raqamFormatla } from '../../../i18n/til';
import type { EntryCopy } from '../product-scope';
import { introCopy as c } from './copy';
import { useSeen } from './hooks';

type Local = (s: EntryCopy) => string;
type Kat = 'chel' | 'mash' | 'mat' | 'ob';
type Row =
  | { kind: 'title'; id: string }
  | { kind: 'section'; id: string; no: string; name: string; count: number }
  | { kind: 'work'; id: string; no: string; code: string; name: string; unit: string; qty: number; mix: Partial<Record<Kat, number>>; done: number; unknown?: boolean }
  | { kind: 'res'; id: string; kat: Kat; name: string; unit: string; qty: number | null };

/** Estimate source text stays in Russian, exactly like the official LRV/RES documents. */
const rows: readonly Row[] = [
  { kind: 'title', id: 't' },
  { kind: 'section', id: 's1', no: '1', name: 'Земляные работы', count: 1 },
  { kind: 'work', id: 'w1', no: '1', code: 'E1-1-12-3', name: 'Разработка грунта экскаватором', unit: '1000 м3', qty: 0.412, mix: { chel: 22, mash: 78 }, done: 100 },
  { kind: 'res', id: 'r1', kat: 'chel', name: 'Затраты труда рабочих', unit: 'чел-ч', qty: 26.8 },
  { kind: 'res', id: 'r2', kat: 'mash', name: 'Экскаватор 0,65 м3', unit: 'маш-ч', qty: 11.2 },
  { kind: 'section', id: 's2', no: '2', name: 'Фундаменты', count: 3 },
  { kind: 'work', id: 'w2', no: '2', code: 'E6-1-1-1', name: 'Устройство бетонной подготовки', unit: '100 м3', qty: 0.288, mix: { chel: 18, mash: 7, mat: 75 }, done: 100 },
  { kind: 'work', id: 'w3', no: '3', code: 'E6-1-1-22', name: 'Устройство ленточных фундаментов ж/б', unit: '100 м3', qty: 1.2, mix: { chel: 24, mash: 6, mat: 70 }, done: 92 },
  { kind: 'res', id: 'r3', kat: 'mat', name: 'Бетон тяжелый, класс В15', unit: 'м3', qty: 121.8 },
  { kind: 'work', id: 'w4', no: '4', code: 'E6-1-97-1', name: 'Установка арматуры', unit: 'т', qty: 1.85, mix: { chel: 31, mash: 4, mat: 65 }, done: 64, unknown: true },
  { kind: 'res', id: 'r4', kat: 'mat', name: 'Сталь арматурная А500С', unit: 'т', qty: null },
];
const KATS: readonly { id: Kat; label: string }[] = [{ id: 'chel', label: 'ЧЕЛ' }, { id: 'mash', label: 'МАШ' }, { id: 'mat', label: 'МАТ' }, { id: 'ob', label: 'ОБ' }];
const OVERALL = 81;
const SHEET_TITLE = 'ЛОКАЛЬНАЯ РЕСУРСНАЯ ВЕДОМОСТЬ № 02-01', SECTION_WORD = 'Раздел';
const fallbackMv = motionValue(0);
const spring = { type: 'spring', stiffness: 170, damping: 24, mass: 0.9 } as const;

/**
 * Hero visual: a messy Excel estimate that reorganises itself into TIZIM_02's structured, colour-coded tree.
 * `progress` (0→1) scrubs it from scroll; without it the morph plays once when seen. Viewers can always switch
 * views by hand, so nothing depends on motion.
 */
export function HeroSheet({ local, progress }: { local: Local; progress: MotionValue<number> | null }) {
  const ref = useRef<HTMLElement>(null);
  const seen = useSeen(ref, 0.5);
  const [auto, setAuto] = useState(0); // 0 excel, 1 scanning, 2 live
  const [manual, setManual] = useState<null | 'excel' | 'live'>(null);

  useMotionValueEvent(progress ?? fallbackMv, 'change', v => { if (progress) setAuto(v < 0.06 ? 0 : v < 0.32 ? 1 : 2); });
  useEffect(() => {
    if (progress || !seen) return;
    const a = setTimeout(() => setAuto(1), 700), b = setTimeout(() => setAuto(2), 2100);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [progress, seen]);

  const live = manual ? manual === 'live' : auto === 2;
  const stage = manual ? (manual === 'live' ? 2 : 0) : auto;
  const visible = rows.filter(r => (live ? r.kind === 'section' || r.kind === 'work' : true));
  const fmt = (n: number) => raqamFormatla(n, { maximumFractionDigits: 3 });

  return <figure ref={ref} className="entry-sheet" data-view={live ? 'live' : 'excel'} aria-label={local(c.sheetTitle)}>
    <div className="entry-sheet-bar">
      <span className="entry-sheet-file">{live ? <Sparkles size={15} aria-hidden="true" /> : <FileSpreadsheet size={15} aria-hidden="true" />}
        <b>{live ? local(c.sheetTitle) : local(c.sheetName)}</b></span>
      <span className="entry-sheet-sample">{local(c.sample)}</span>
      <div className="entry-sheet-toggle" role="group" aria-label={local(c.viewSwitch)}>
        <button type="button" aria-pressed={!live} onClick={() => setManual('excel')}>{local(c.viewExcel)}</button>
        <button type="button" aria-pressed={live} onClick={() => setManual('live')}>{local(c.viewLive)}</button>
      </div>
    </div>
    <div className="entry-sheet-stage" aria-live="polite">
      <AnimatePresence mode="wait" initial={false}>
        <motion.p key={stage} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }}>
          <i className="entry-rhomb" aria-hidden="true" />{local(stage === 0 ? c.stage1 : stage === 1 ? c.stage2 : c.stage3)}
        </motion.p>
      </AnimatePresence>
    </div>
    <div className="entry-sheet-body">
      {!live && <div className="entry-sheet-cols" aria-hidden="true"><span /><span>A</span><span>B</span><span>C</span><span>D</span><span>E</span></div>}
      {stage === 1 && <ScanBeam progress={progress} />}
      <LayoutGroup>
        <ul className="entry-sheet-rows">
          <AnimatePresence initial={false}>
            {visible.map((r, i) => <motion.li key={r.id} layout="position" className={`entry-row entry-row--${r.kind}`}
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0, transition: { duration: 0.25 } }}
              transition={{ ...spring, delay: live ? i * 0.035 : 0 }}>
              {!live && <span className="entry-row-n" aria-hidden="true">{i + 1}</span>}
              {r.kind === 'title' && <span className="entry-cell entry-cell--merged">{SHEET_TITLE}</span>}
              {r.kind === 'section' && (live
                ? <span className="entry-tree-section"><i className="entry-rhomb" aria-hidden="true" /><b>{r.no}.</b>{r.name}<em>{r.count} {local(c.works)}</em></span>
                : <span className="entry-cell entry-cell--merged entry-cell--bold">{`${SECTION_WORD} ${r.no}. ${r.name}`}</span>)}
              {r.kind === 'work' && (live ? <WorkLive r={r} fmt={fmt} local={local} /> : <>
                <span className="entry-cell entry-cell--num">{r.no}</span>
                <span className="entry-cell entry-cell--code">{r.code}</span>
                <span className="entry-cell entry-cell--name">{r.name}</span>
                <span className="entry-cell">{r.unit}</span>
                <span className="entry-cell entry-cell--num">{fmt(r.qty)}</span>
              </>)}
              {r.kind === 'res' && <>
                <span className="entry-cell" />
                <span className="entry-cell entry-cell--dim">{KATS.find(k => k.id === r.kat)?.label}</span>
                <span className="entry-cell entry-cell--name entry-cell--dim">{r.name}</span>
                <span className="entry-cell entry-cell--dim">{r.unit}</span>
                <span className={`entry-cell entry-cell--num ${r.qty == null ? 'entry-cell--error' : 'entry-cell--dim'}`}>{r.qty == null ? '#REF!' : fmt(r.qty)}</span>
              </>}
            </motion.li>)}
          </AnimatePresence>
        </ul>
      </LayoutGroup>
      <AnimatePresence>
        {live && <motion.div className="entry-sheet-foot" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ ...spring, delay: 0.25 }}>
          <div className="entry-sheet-meter">
            <span>{local(c.done)}</span>
            <div className="entry-meter" aria-hidden="true"><motion.i initial={{ width: 0 }} animate={{ width: `${OVERALL}%` }} transition={{ duration: 1.1, ease: [0.2, 0.8, 0.2, 1], delay: 0.35 }} /></div>
            <b>{OVERALL}%</b>
          </div>
          <p className="entry-sheet-summary"><span>4 {local(c.works)}</span><span>2 {local(c.sections)}</span><span className="is-warn"><AlertTriangle size={12} aria-hidden="true" />1 {local(c.warning)}</span></p>
          <p className="entry-sheet-legend">{local(c.legend).split(' · ').map((part, i) => <span key={part} className={`entry-legend--${KATS[i]?.id ?? 'ob'}`}><i aria-hidden="true" />{part}</span>)}</p>
        </motion.div>}
      </AnimatePresence>
    </div>
  </figure>;
}

function WorkLive({ r, fmt, local }: { r: Extract<Row, { kind: 'work' }>; fmt: (n: number) => string; local: Local }) {
  return <span className="entry-tree-work">
    <span className="entry-tree-line">
      <code>{r.code}</code>
      <span className="entry-tree-name">{r.name}</span>
      <span className="entry-tree-qty">{fmt(r.qty)}<i>{r.unit}</i></span>
    </span>
    <span className="entry-tree-meta">
      <span className="entry-mix" aria-hidden="true">{KATS.filter(k => r.mix[k.id]).map(k =>
        <motion.i key={k.id} className={`entry-mix--${k.id}`} initial={{ width: 0 }} animate={{ width: `${r.mix[k.id]}%` }} transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1], delay: 0.3 }} />)}</span>
      {r.unknown
        ? <span className="entry-chip entry-chip--warn"><AlertTriangle size={11} aria-hidden="true" />{local(c.noSource)}</span>
        : <span className={`entry-chip ${r.done >= 100 ? 'entry-chip--ok' : ''}`}>{r.done}%</span>}
    </span>
  </span>;
}

function ScanBeam({ progress }: { progress: MotionValue<number> | null }) {
  const top = useTransform(progress ?? fallbackMv, [0.06, 0.32], ['0%', '100%']);
  return progress
    ? <motion.i className="entry-scan" aria-hidden="true" style={{ top }} />
    : <motion.i className="entry-scan" aria-hidden="true" initial={{ top: '0%' }} animate={{ top: '100%' }} transition={{ duration: 1.3, ease: 'easeInOut' }} />;
}

