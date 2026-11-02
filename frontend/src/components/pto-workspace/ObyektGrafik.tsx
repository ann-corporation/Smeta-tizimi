import { useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { T2Obyekt } from '../../api/supabase';
import { FmtN } from '../../lib/format';
import { t } from '../../i18n/til';
import type { FinancialTotals } from './financials';
import { katSegmentlar, type KatSegment } from './kat-segmentlar';

/**
 * Obyekt/loyiha grafiklari (Firuza): kategoriya taqsimoti, smeta → F2 → fakt progressi, loyiha bo‘yicha stack ustunlar.
 * Yangi pul formulasi YO‘Q — faqat mavjud summalarni chizadi. NULL ≠ 0: noma’lum qiymat «—», segment chizilmaydi.
 * Rang faqat Firuza CSS o‘zgaruvchilaridan; harakat `useReducedMotion` ga bo‘ysunadi.
 */

function katNomi(k: KatSegment['kalit']): string {
  switch (k) {
    case 'chel': return t('Mehnat (ЧЕЛ)');
    case 'mash': return t('Mashina (МАШ)');
    case 'mat': return t('Material (МАТ)');
    case 'ob': return t('Uskuna (ОБ)');
    default: return t('Boshqa material (БЕЗ СКЛАД, КАБ, М/К)');
  }
}

/** Kategoriya taqsimoti: animatsiyali ulushli chiziq + legenda (ustamasiz, to‘g‘ri xarajat). */
export function KatTaqsimot({ obyekt }: { obyekt: Pick<T2Obyekt, 'jami' | 'chel' | 'mash' | 'mat' | 'ob'> }) {
  const kam = useReducedMotion();
  const { segmentlar, jami } = useMemo(() => katSegmentlar(obyekt), [obyekt]);
  if (segmentlar.length === 0 || jami === 0) return <span className="text-[11.5px] text-text-mute">{t('Kategoriya taqsimoti: —')}</span>;
  const izoh = segmentlar.map((s) => `${katNomi(s.kalit)} ${Math.round((s.summa / jami) * 100)}%`).join(', ');
  return (
    <div className="flex flex-col gap-1.5" aria-label={t('Kategoriya taqsimoti')}>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-3" role="img" aria-label={izoh}>
        {segmentlar.map((s, i) => (
          <motion.i key={s.kalit} className="block h-full" style={{ background: s.rang }}
            initial={kam ? false : { width: 0 }} animate={{ width: `${(s.summa / jami) * 100}%` }}
            transition={kam ? { duration: 0 } : { duration: 0.6, delay: i * 0.06, ease: 'easeOut' }} />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-text-mute">
        {segmentlar.map((s) => (
          <li key={s.kalit} className="inline-flex items-center gap-1">
            <i aria-hidden="true" className="inline-block h-2 w-2 rounded-sm" style={{ background: s.rang }} />
            <span>{katNomi(s.kalit)}</span><b className="tabular-nums text-text-dim"><FmtN val={s.summa} kasr={0} /></b>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Qadam({ nom, ulush, rang, matn, boshlash }: { nom: string; ulush: number | null; rang: string; matn: string; boshlash: number }) {
  const kam = useReducedMotion();
  return (
    <div className="grid grid-cols-[84px_1fr_auto] items-center gap-2 text-[11.5px]">
      <span className="truncate text-text-dim">{nom}</span>
      <span className="h-2 overflow-hidden rounded-full bg-surface-3">
        {ulush != null && <motion.i className="block h-full rounded-full" style={{ background: rang }}
          initial={kam ? false : { width: 0 }} animate={{ width: `${Math.min(1, Math.max(0, ulush)) * 100}%` }}
          transition={kam ? { duration: 0 } : { duration: 0.7, delay: boshlash, ease: 'easeOut' }} />}
      </span>
      <b className="min-w-[38px] text-right tabular-nums text-text">{matn}</b>
    </div>
  );
}

/** Obyekt progressi: smeta (100%) → F2 tasdiqlangan → fakt. Noma’lum qiymat — bo‘sh chiziq va «—». */
export function ProgressQadam({ fin }: { fin: FinancialTotals }) {
  const { smeta, f2, fakt } = fin;
  const asos = smeta.present > 0 && smeta.known > 0 ? smeta.known : null;
  const ul = (a: { present: number; known: number }) => (asos == null || a.present === 0 ? null : a.known / asos);
  const f2u = ul(f2), faktu = ul(fakt);
  const pct = (u: number | null) => (u == null ? '—' : `${Math.round(u * 100)}%`);
  return (
    <div className="flex flex-col gap-1.5" aria-label={t('Smeta → F2 → fakt progressi')}>
      <Qadam nom={t('Smeta')} ulush={asos == null ? null : 1} rang="var(--text-dim)" matn={asos == null ? '—' : '100%'} boshlash={0} />
      <Qadam nom={t('F2 tasdiqlangan')} ulush={f2u} rang="var(--accent)" matn={pct(f2u)} boshlash={0.1} />
      <Qadam nom={t('Fakt')} ulush={faktu} rang="var(--info)" matn={pct(faktu)} boshlash={0.2} />
    </div>
  );
}

export type StackQator = { kalit: string; nom: string; fin: FinancialTotals };

/** Loyiha/shartnoma darajasidagi stack ustunlar: F2 | fakt (F2 siz) | qoldiq. Faqat smetasi ma’lum qatorlar. */
export function LoyihaStack({ qatorlar }: { qatorlar: readonly StackQator[] }) {
  const kam = useReducedMotion();
  const data = useMemo(() => qatorlar
    .filter((q) => q.fin.smeta.present > 0 && q.fin.smeta.known > 0)
    .map((q) => {
      const smeta = q.fin.smeta.known;
      const f2 = q.fin.f2.present > 0 ? Math.max(0, q.fin.f2.known) : 0;
      const fakt = q.fin.fakt.present > 0 ? Math.max(0, q.fin.fakt.known) : 0;
      const bajarilgan = Math.max(f2, fakt);
      return { nom: q.nom.length > 26 ? `${q.nom.slice(0, 25)}…` : q.nom, f2, faktOrtiq: Math.max(0, fakt - f2), qoldiq: Math.max(0, smeta - bajarilgan) };
    })
    .sort((a, b) => (b.f2 + b.faktOrtiq + b.qoldiq) - (a.f2 + a.faktOrtiq + a.qoldiq))
    .slice(0, 12), [qatorlar]);
  if (data.length < 1) return null;
  const nomF2 = t('F2 tasdiqlangan'), nomFakt = t('fakt (F2 siz)'), nomQoldiq = t('qoldiq');
  const tick = { fill: 'var(--text-mute)', fontSize: 11 };
  return (
    <section className="fz-panel" aria-label={t('Smeta bajarilishi — stack ustunlar')}>
      <div className="fz-panel__h"><span>{t('Smeta bajarilishi (ustamasiz)')}</span><span>{t('so‘m')}</span></div>
      <div style={{ width: '100%', height: Math.max(120, data.length * 34 + 36) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 4 }} barCategoryGap={8}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tick={tick} stroke="var(--border)" tickFormatter={(v: number) => (v >= 1e9 ? `${(v / 1e9).toFixed(1)} ${t('mlrd')}` : v >= 1e6 ? `${Math.round(v / 1e6)} ${t('mln')}` : String(v))} />
            <YAxis type="category" dataKey="nom" width={140} tick={tick} stroke="var(--border)" />
            <Tooltip cursor={{ fill: 'var(--surface-2)' }}
              contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 12 }}
              formatter={(v) => Number(v ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} />
            <Bar dataKey="f2" name={nomF2} stackId="a" fill="var(--accent)" isAnimationActive={!kam} animationDuration={700} />
            <Bar dataKey="faktOrtiq" name={nomFakt} stackId="a" fill="var(--info)" isAnimationActive={!kam} animationDuration={700} />
            <Bar dataKey="qoldiq" name={nomQoldiq} stackId="a" fill="var(--surface-3)" stroke="var(--border-strong)" isAnimationActive={!kam} animationDuration={700} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11.5px] text-text-mute">
        <span className="inline-flex items-center gap-1.5"><i aria-hidden="true" className="inline-block h-2 w-2 rounded-sm" style={{ background: 'var(--accent)' }} />{nomF2}</span>
        <span className="inline-flex items-center gap-1.5"><i aria-hidden="true" className="inline-block h-2 w-2 rounded-sm" style={{ background: 'var(--info)' }} />{nomFakt}</span>
        <span className="inline-flex items-center gap-1.5"><i aria-hidden="true" className="inline-block h-2 w-2 rounded-sm" style={{ background: 'var(--surface-3)', boxShadow: 'inset 0 0 0 1px var(--border-strong)' }} />{nomQoldiq}</span>
      </div>
    </section>
  );
}

export type HisobQator = { kalit: string; nom: string; tolov: number; qarz: number; qolgan: number };

/**
 * Shartnoma zanjiri (loyiha darajasi): to‘langan | hisoblangan, to‘lanmagan (F3) | hali hisoblanmagan.
 * Bu HAQIQIY pul (shartnoma/F3/to‘lov, QQS bilan) — ustama qo‘shilmaydi. Shartnoma summasi noma’lum loyiha chizilmaydi.
 */
export function HisobStack({ qatorlar }: { qatorlar: readonly HisobQator[] }) {
  const kam = useReducedMotion();
  const data = useMemo(() => qatorlar.map((q) => ({ ...q, nom: q.nom.length > 26 ? `${q.nom.slice(0, 25)}…` : q.nom })).slice(0, 12), [qatorlar]);
  if (!data.length) return null;
  const nomTolov = t('to‘langan'), nomQarz = t('hisoblangan, to‘lanmagan'), nomQolgan = t('hali hisoblanmagan');
  const tick = { fill: 'var(--text-mute)', fontSize: 11 };
  return (
    <section className="fz-panel" aria-label={t('Shartnoma bo‘yicha hisob — stack ustunlar')}>
      <div className="fz-panel__h"><span>{t('Shartnoma zanjiri: to‘lov va hisob')}</span><span>{t('QQS bilan, so‘m')}</span></div>
      <div style={{ width: '100%', height: Math.max(120, data.length * 34 + 36) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 4 }} barCategoryGap={8}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tick={tick} stroke="var(--border)" tickFormatter={(v: number) => (v >= 1e9 ? `${(v / 1e9).toFixed(1)} ${t('mlrd')}` : v >= 1e6 ? `${Math.round(v / 1e6)} ${t('mln')}` : String(v))} />
            <YAxis type="category" dataKey="nom" width={140} tick={tick} stroke="var(--border)" />
            <Tooltip cursor={{ fill: 'var(--surface-2)' }}
              contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 12 }}
              formatter={(v) => Number(v ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} />
            <Bar dataKey="tolov" name={nomTolov} stackId="h" fill="var(--ok)" isAnimationActive={!kam} animationDuration={700} />
            <Bar dataKey="qarz" name={nomQarz} stackId="h" fill="var(--accent)" isAnimationActive={!kam} animationDuration={700} />
            <Bar dataKey="qolgan" name={nomQolgan} stackId="h" fill="var(--surface-3)" stroke="var(--border-strong)" isAnimationActive={!kam} animationDuration={700} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
