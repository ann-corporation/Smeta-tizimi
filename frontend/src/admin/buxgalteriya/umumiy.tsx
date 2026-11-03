import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
import { FmtN } from '../../lib/format';
import { t } from '../../i18n/til';
import { saldoTomoni } from '../../lib/buxgalteriya/hisob';
import { td } from './yordamchi';

/** Oddiy so'zli tushuntirish: sichqoncha ustiga olib borilsa (yoki fokus) matn chiqadi. */
export function Izoh({ matn }: { matn: string }): ReactNode {
  return <span tabIndex={0} title={matn} aria-label={matn} className="ml-1 inline-flex cursor-help align-middle text-text-mute"><Info size={12} /></span>;
}

/** Pul: noma'lum — tire (0 emas); minus oddiy ko'rinadi (storno ma'nosi — minus ruxsat). */
export function Son({ v, qalin = false }: { v: number | null | undefined; qalin?: boolean }) {
  if (v == null) return <span className="text-text-mute" title={t('Noma‘lum (kiritilmagan)')}>—</span>;
  return qalin ? <b className="tabular-nums"><FmtN val={v} /></b> : <span className="tabular-nums"><FmtN val={v} /></span>;
}

/** Nol bo'lsa bo'sh katak (ОСВ ko'rinishi), aks holda son. */
export function SonBosh({ v }: { v: number | null | undefined }) {
  return v == null || v === 0 ? <span className="text-text-mute"> </span> : <Son v={v} />;
}

/** Saldo (Dt − Kt): Debet tomonda yoki Kredit tomonda — ikki katak. */
export function SaldoKataklari({ net, sinf = 'text-right' }: { net: number | null | undefined; sinf?: string }) {
  const s = saldoTomoni(net);
  return (<>
    <td className={`${td} ${sinf}`}><SonBosh v={s.dt} /></td>
    <td className={`${td} ${sinf}`}><SonBosh v={s.kt} /></td>
  </>);
}

export function XatoQator({ xato }: { xato: string | null }) {
  return xato ? <p role="alert" className="text-[13px] text-danger">{xato}</p> : null;
}