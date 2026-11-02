import { Cell, Pie, PieChart } from 'recharts';
import { useReducedMotion } from 'framer-motion';
import { pulQisqa } from '../../lib/format';
import { t } from '../../i18n/til';
import { KAT_GURUH_NOMI, type BolimBajarilish, type KatGuruh, type KatTaqsimot } from '../../lib/f2-hujjat-korinish';
import { OsuvchiI } from './OsuvchiI';

/**
 * F2 hujjati diagrammalari (egasi 2026-10-25/26): kategoriya donuti va bo'limlar bo'yicha bajarilish chiziqlari
 * (smeta = 100%: oldin olingan / shu F2). Faqat yuklangan ma'lumotni chizadi; rang — Firuza o'zgaruvchilari.
 */
const RANG: Record<KatGuruh, string> = { chel: 'var(--kat-chel)', mash: 'var(--kat-mash)', mat: 'var(--kat-mat)', ob: 'var(--kat-ob)', nomalum: 'var(--border-strong)' };

export function KatDonut({ qismlar, jami }: { qismlar: KatTaqsimot; jami: number }) {
  const kam = useReducedMotion();
  const q = qismlar.filter((x) => x.summa > 0);
  if (!q.length) return null;
  const izoh = q.map((k) => `${t(KAT_GURUH_NOMI[k.guruh])} ${Math.round(k.ulush * 100)}%`).join(', ');
  return (
    <div className="relative mx-auto h-[136px] w-[136px]" role="img" aria-label={izoh} data-testid="kat-donut">
      <PieChart width={136} height={136}>
        <Pie data={q} dataKey="summa" nameKey="guruh" innerRadius={44} outerRadius={64} paddingAngle={q.length > 1 ? 2 : 0} startAngle={90} endAngle={-270}
          stroke="var(--surface)" strokeWidth={2} isAnimationActive={!kam} animationDuration={700}>
          {q.map((k) => <Cell key={k.guruh} fill={RANG[k.guruh]} />)}
        </Pie>
      </PieChart>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center leading-tight">
        <b className="text-[14px] font-semibold tabular-nums text-text">{pulQisqa(jami)}</b>
        <span className="text-[10.5px] text-text-mute">{t('ustamasiz')}</span>
      </div>
    </div>
  );
}

export function BolimBajarilishPanel({ bolimlar }: { bolimlar: readonly BolimBajarilish[] }) {
  const korinadi = bolimlar.filter((b) => b.foiz != null).slice(0, 8);
  if (!korinadi.length) return null;
  return (
    <section className="fz-panel" aria-label={t('Bo‘limlar bajarilishi')} data-testid="bolim-bajarilish">
      <div className="fz-panel__h"><span>{t('Bo‘limlar bajarilishi')}</span><span>{t('smeta = 100%')}</span></div>
      <div className="flex flex-col gap-2">
        {korinadi.map((b, i) => (
          <div key={b.qator_id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2.5 gap-y-[3px] text-[12.5px]" title={t('Oldin olingan: {o}% · shu F2: {s}%', { o: Math.round(b.oldinUlush * 100), s: Math.round(b.shuUlush * 100) })}>
            <span className="truncate text-text-dim">{b.nom || t('Nomsiz bo‘lim')}</span><b className="tabular-nums">{Math.round(b.foiz ?? 0)}%</b>
            <span className="fz-meter__t" style={{ gridColumn: '1 / -1' }}>
              <OsuvchiI ulush={b.oldinUlush} className="fz-meter__oldin" kechikish={i * 0.04} />
              <OsuvchiI ulush={b.shuUlush} className="fz-meter__shu" kechikish={i * 0.04 + 0.1} />
            </span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-text-mute">
        <span className="inline-flex items-center gap-1.5"><i className="fz-meter__oldin inline-block h-2 w-3 rounded-sm" />{t('oldin olingan')}</span>
        <span className="inline-flex items-center gap-1.5"><i className="fz-meter__shu inline-block h-2 w-3 rounded-sm" />{t('shu F2')}</span>
      </div>
      <div className="text-[11px] text-text-mute">{t('Bo‘limdagi ishlar hajm ulushining o‘rtachasi (summa emas)')}</div>
    </section>
  );
}
