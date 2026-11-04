/**
 * Uy sotish ekranlari uchun umumiy komponentlar: pul ko'rinishi, qisqa summa, maydon, sana.
 * Sotuv narxi smeta puli EMAS — «ustamali» qoidasi qo'llanmaydi: summa va valyuta ko'rsatiladi.
 */
import type { ReactNode } from 'react';
import { FmtN } from '../../lib/format';
import type { Valyuta } from '../../api/t2-sotuv';
import { ixcham } from '../../lib/sotuv/shaxmatka-korinish';
import { IXCHAM_NOMI, yorliq } from './sotuv-umumiy';

/** To'liq summa + valyuta (null — «—», 0 emas). */
export function Pul({ val, valyuta = 'UZS', cl = '' }: { val: number | null | undefined; valyuta?: Valyuta | string; cl?: string }) {
  if (val == null) return <span className="text-text-mute">—</span>;
  return <span className={`tabular-nums whitespace-nowrap ${cl}`}><FmtN val={val} kasr={0} /> <span className="text-[0.8em] text-text-mute">{valyuta}</span></span>;
}

/** Qisqa summa (katak va KPI uchun): 1.25 mlrd. */
export function Ixcham({ val, cl = '' }: { val: number | null | undefined; cl?: string }) {
  const x = ixcham(val);
  if (!x) return <span className="text-text-mute">—</span>;
  const b = IXCHAM_NOMI[x.birlik]();
  return <span className={`tabular-nums whitespace-nowrap ${cl}`}>{x.son}{b ? ` ${b}` : ''}</span>;
}

export function Maydon({ nom, children, cl = '' }: { nom: string; children: ReactNode; cl?: string }) {
  return <label className={`block ${cl}`}><span className={yorliq}>{nom}</span>{children}</label>;
}

export function Sana({ v }: { v: string | null | undefined }) {
  if (!v) return <span className="text-text-mute">—</span>;
  return <span className="tabular-nums">{String(v).slice(0, 10)}</span>;
}

