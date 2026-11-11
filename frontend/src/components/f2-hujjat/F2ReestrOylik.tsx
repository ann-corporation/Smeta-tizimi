import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useReducedMotion } from 'framer-motion';
import { pulQisqa } from '../../lib/format';
import { t, tilLocale } from '../../i18n/til';
import { davrNomi } from '../../lib/f2-hujjat-korinish';
import { oylikJami } from '../../lib/f2-reestr/reestr-korinish';

/**
 * F2 reestri: oylar bo'yicha F2 hujjat jami (ustamasiz) — holat ranglari bilan (tasdiqlangan / jarayonda / rad / bekor).
 * Holat rangda emas, legendada SO'Z bilan ham yozilgan. Summasi noma'lum aktlar 0 emas — alohida yozuv.
 */
const QISMLAR = [
  { k: 'tasdiqlangan', nom: 'Tasdiqlangan', rang: 'var(--ok)' },
  { k: 'jarayonda', nom: 'Jarayonda', rang: 'var(--warn)' },
  { k: 'rad', nom: 'Rad etilgan', rang: 'var(--danger)' },
  { k: 'bekor', nom: 'Bekor qilingan', rang: 'var(--border-strong)' },
] as const;

type Akt = Parameters<typeof oylikJami>[0][number];

export function F2ReestrOylik({ aktlar }: { aktlar: readonly Akt[] }) {
  const kam = useReducedMotion();
  const oylar = useMemo(() => oylikJami(aktlar).slice(-12).map((o) => ({ ...o, nom: davrNomi(o.oy, tilLocale()) || o.oy })), [aktlar]);
  if (!oylar.length) return null;
  const nomalum = oylar.reduce((a, o) => a + o.nomalumSoni, 0);
  return (
    <section className="fz-card" aria-label={t('Oylik F2 grafigi')} data-testid="reestr-oylik">
      <div className="fz-card__head">
        <div><h3 className="fz-card__title">{t('Oylar bo‘yicha F2 summasi')}</h3><p className="fz-card__sub">{t('ustamasiz, QQS siz · holat bo‘yicha')}</p></div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-text-dim">
          {QISMLAR.map((q) => <span key={q.k} className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: q.rang }} />{t(q.nom)}</span>)}
        </div>
      </div>
      <div className="fz-card__body" style={{ height: 232 }} role="img" aria-label={t('Oylar bo‘yicha F2 summasi')}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 640, height: 200 }}>
          <BarChart data={oylar} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="nom" tick={{ fill: 'var(--text-dim)', fontSize: 11 }} tickLine={false} axisLine={{ stroke: 'var(--border)' }} interval="preserveStartEnd" />
            <YAxis tick={{ fill: 'var(--text-mute)', fontSize: 11 }} tickLine={false} axisLine={false} width={64} tickFormatter={(v: number) => pulQisqa(v)} />
            <Tooltip cursor={{ fill: 'var(--surface-3)' }} formatter={(v: unknown, n: unknown) => [pulQisqa(Number(v)), t(QISMLAR.find((q) => q.k === n)?.nom ?? String(n))]}
              contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 12 }} labelStyle={{ color: 'var(--text-dim)' }} />
            {QISMLAR.map((q, i) => <Bar key={q.k} dataKey={q.k} stackId="f2" fill={q.rang} isAnimationActive={!kam} animationDuration={600} animationBegin={i * 80} radius={i === QISMLAR.length - 1 ? [2, 2, 0, 0] : 0} />)}
          </BarChart>
        </ResponsiveContainer>
      </div>
      {nomalum > 0 && <div className="px-5 pb-4"><span className="fz-chip fz-chip--warn">{t('{n} ta F2 ning summasi noma’lum — grafikka kirmagan', { n: nomalum })}</span></div>}
    </section>
  );
}
