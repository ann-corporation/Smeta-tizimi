import { t } from '../../i18n/til';
import type { M29Chetlanish } from '../../lib/m29-korinish';
import { OsuvchiI } from '../f2-hujjat/OsuvchiI';

/**
 * M-29: normadan eng ko'p chetlashgan materiallar — norma = 100% belgisi, fakt chizig'i (sarf ↔ norma).
 * Ortiqcha — qizil, tejalgan — yashil; holat so'z bilan ham yoziladi. Shkala 2× normada kesiladi.
 */
export function M29ChetlanishDiagramma({ royxat }: { royxat: readonly M29Chetlanish[] }) {
  if (!royxat.length) return null;
  const MAX = 2;
  return (
    <section className="fz-panel sm:col-span-2 xl:col-span-4" aria-label={t('Normadan eng ko‘p chetlashganlar')} data-testid="m29-chetlanish">
      <div className="fz-panel__h"><span>{t('Normadan eng ko‘p chetlashganlar')}</span><span>{t('norma = 100%')}</span></div>
      <div className="flex flex-col gap-2">
        {royxat.map((m, i) => {
          const oshgan = m.holat === 'ortiqcha';
          const u = Math.min(m.foiz / 100, MAX) / MAX;
          return (
            <div key={m.kalit} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2.5 gap-y-[3px] text-[12.5px]" title={t('Norma: {n} · fakt: {f}', { n: m.norma.toLocaleString('ru-RU', { maximumFractionDigits: 3 }), f: m.fakt.toLocaleString('ru-RU', { maximumFractionDigits: 3 }) })}>
              <span className="truncate text-text-dim">{m.nom}{m.birlik ? `, ${m.birlik}` : ''}</span>
              <b className="tabular-nums" style={{ color: oshgan ? 'var(--danger)' : 'var(--ok)' }}>{oshgan ? t('ortiqcha {f}%', { f: Math.round(m.foiz - 100) }) : t('tejaldi {f}%', { f: Math.round(100 - m.foiz) })}</b>
              <span className="fz-meter__t relative" style={{ gridColumn: '1 / -1' }}>
                <OsuvchiI ulush={u} className="absolute inset-y-0 left-0" style={{ background: oshgan ? 'var(--danger)' : 'var(--ok)' }} kechikish={i * 0.04} />
                <i className="absolute -inset-y-px w-0.5" style={{ left: 'calc(50% - 1px)', background: 'var(--text)' }} aria-hidden="true" />
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
