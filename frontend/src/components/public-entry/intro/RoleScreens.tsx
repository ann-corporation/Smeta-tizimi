import { motion } from 'framer-motion';
import { AlertTriangle, Check, Sparkles, Truck, Warehouse, Clock3 } from 'lucide-react';
import type { ReactNode } from 'react';
import type { EntryCopy } from '../product-scope';
import { introCopy as c } from './copy';

type Local = (s: EntryCopy) => string;
const AI_WORK = 'Устройство бетонной подготовки', BRAND = 'TIZIM_02';
const u = {
  objects: ['Obyektlar', 'Объекты', 'Objects'],
  approvedF2: ['Tasdiqlangan F2', 'Утверждённые Ф2', 'Approved F2'],
  issues: ['Muammoli hujjat', 'Проблемные документы', 'Document issues'],
  blockB: ['Turar joy · B blok', 'Жилой дом · блок B', 'Housing · block B'],
  school: ['Maktab · 2-navbat', 'Школа · 2-я очередь', 'School · phase 2'],
  depot: ['Ombor binosi', 'Здание склада', 'Warehouse building'],
  matches: ['smeta bilan mos', 'совпадает со сметой', 'matches estimate'],
  over: ['smetadan oshdi', 'превышение сметы', 'over estimate'],
  accept: ['Qabul qilish', 'Принять', 'Accept'],
  fix: ['Tuzatish so‘rash', 'Запросить исправление', 'Request a fix'],
  concrete: ['Beton B15', 'Бетон В15', 'Concrete B15'],
  rebar: ['Armatura A500C', 'Арматура А500С', 'Rebar A500C'],
  sand: ['Qum', 'Песок', 'Sand'],
  onWay: ['Yo‘lda', 'В пути', 'In transit'],
  inStock: ['Omborda', 'На складе', 'In stock'],
  requested: ['So‘ralgan', 'Запрошено', 'Requested'],
  acts: ['Akt', 'Акт', 'Act'],
  paidShort: ['To‘lov', 'Оплата', 'Paid'],
  months: ['Avg · Sen · Okt', 'Авг · Сен · Окт', 'Aug · Sep · Oct'],
  submitted: ['Sizga yuborildi', 'Отправлено вам', 'Sent to you'],
} satisfies Record<string, EntryCopy>;

/** Small, honest mock screens (labelled sample) that show what each role sees first. */
export function RoleScreen({ id, local }: { id: string; local: Local }) {
  const screen = (): ReactNode => {
    switch (id) {
      case 'director': return <>
      <div className="entry-kpis">{[[u.objects, '6'], [u.approvedF2, '14'], [u.issues, '2']].map(([l, v], i) =>
        <div key={i} className={i === 2 ? 'is-warn' : ''}><span>{local(l as EntryCopy)}</span><b>{v as string}</b></div>)}</div>
      {[[u.blockB, 81], [u.school, 46], [u.depot, 18]].map(([l, v]) => <div key={String(v)} className="entry-progress-row">
        <span>{local(l as EntryCopy)}</span><div className="entry-meter"><motion.i initial={{ width: 0 }} animate={{ width: `${v}%` }} transition={{ duration: 0.7 }} /></div><b>{String(v)}%</b></div>)}
    </>;
      case 'pto': return <ul className="entry-checks">
      {[['E6-1-1-22', '36 м³', true], ['E6-1-97-1', '0,58 т', false], ['E6-1-1-1', '28,8 м³', true]].map(([code, q, ok]) =>
        <li key={String(code)} className={ok ? '' : 'is-over'}>{ok ? <Check size={14} aria-hidden="true" /> : <AlertTriangle size={14} aria-hidden="true" />}<code>{String(code)}</code><b>{String(q)}</b><span>{local(ok ? u.matches : u.over)}</span></li>)}
    </ul>;
      case 'estimator': return <div className="entry-ai">
      <p className="entry-ai-ask">{local(c.aiPrompt)}</p>
      <motion.div className="entry-ai-answer" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
        <span><Sparkles size={13} aria-hidden="true" />{local(c.aiFound)}</span>
        <code>E6-1-1-1</code><p>{AI_WORK}</p><b>0,288 · 100 м3</b>
      </motion.div>
    </div>;
      case 'supply': return <ul className="entry-reqs">
      {[[u.concrete, '40 м³', u.onWay, 'info'], [u.rebar, '1,2 т', u.inStock, 'ok'], [u.sand, '25 м³', u.requested, 'mute']].map(([l, q, s, tone], i) =>
        <li key={i}>{i === 0 ? <Truck size={15} aria-hidden="true" /> : i === 1 ? <Warehouse size={15} aria-hidden="true" /> : <Clock3 size={15} aria-hidden="true" />}<span>{local(l as EntryCopy)}</span><b>{q as string}</b><em className={`is-${tone as string}`}>{local(s as EntryCopy)}</em></li>)}
    </ul>;
      case 'finance': return <div className="entry-bars">
      <div className="entry-bars-plot" aria-hidden="true">{[[62, 62], [78, 70], [92, 52]].map(([a, p], i) => <div key={i}>
        <motion.i className="is-act" initial={{ height: 0 }} animate={{ height: `${a}%` }} transition={{ delay: i * 0.1 }} />
        <motion.i className="is-ok" initial={{ height: 0 }} animate={{ height: `${p}%` }} transition={{ delay: 0.15 + i * 0.1 }} /></div>)}</div>
      <p><span className="entry-dot is-act" />{local(u.acts)}<span className="entry-dot is-ok" />{local(u.paidShort)}<small>{local(u.months)}</small></p>
    </div>;
      case 'client': return <div className="entry-submit">
      <span className="entry-pill entry-pill--info">{local(u.submitted)}</span>
      <b>F2 · 10/2026 · № 10</b>
      <p>{local(c.rowName)} · 36 м³</p>
      <div><span className="entry-fake-btn is-primary">{local(u.accept)}</span><span className="entry-fake-btn">{local(u.fix)}</span></div>
    </div>;
      default: return null;
    }
  };
  return <div className="entry-role-screen" aria-hidden="true">
    <div className="entry-role-screen-bar"><i /><i /><i /><span>{BRAND}</span><em>{local(c.sample)}</em></div>
    <div className="entry-role-screen-body">{screen()}</div>
  </div>;
}
