import { t, tilLocale } from '../../i18n/til';
import { davrNomi } from '../../lib/f2-hujjat-korinish';
import type { NakopitelniyDavr } from '../../api/t2-nakopitelniy';

/**
 * Davrlar chizig'i: har F2 oyi — nuqta. To'ldirilgan firuza — tasdiqlangan (jamiga kiradi); uzuq chiziqli sariq — qoralama
 * (jamiga KIRMAYDI). Bosish — shu davrga o'tish (select bilan bir xil amal).
 */
export function DavrChiziq({ davrlar, davr, onTanla, band }: { davrlar: NakopitelniyDavr[]; davr: string; onTanla: (oy: string) => void; band: boolean }) {
  if (!davrlar.length) return null;
  const tartibli = [...davrlar].sort((a, b) => a.oy.localeCompare(b.oy));
  return (
    <div role="group" aria-label={t('Davrlar chizig‘i')} style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '0 0 var(--space-1)' }}>
      {tartibli.map((d) => {
        const tanlangan = d.oy === davr;
        const tasdiq = d.certified;
        return (
          <button key={d.oy} type="button" disabled={band} onClick={() => onTanla(d.oy)} aria-pressed={tanlangan}
            title={tasdiq ? t('Tasdiqlangan F2 — jami hisobiga kiradi') : t('Qoralama F2 — jami hisobiga kirmaydi')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, height: 30, padding: '0 10px', flexShrink: 0, cursor: 'pointer',
              borderRadius: 'var(--radius-sm)', font: '500 12.5px/1 var(--font-sans)', whiteSpace: 'nowrap',
              border: `1px ${tasdiq ? 'solid' : 'dashed'} ${tanlangan ? 'var(--accent)' : tasdiq ? 'var(--border-strong)' : 'var(--warn)'}`,
              background: tanlangan ? 'var(--accent-soft)' : 'var(--surface)', color: tanlangan ? 'var(--text)' : 'var(--text-dim)',
            }}>
            <span aria-hidden style={{ width: 8, height: 8, transform: 'rotate(45deg)', background: tasdiq ? 'var(--accent)' : 'transparent', border: `2px solid ${tasdiq ? 'var(--accent)' : 'var(--warn)'}`, boxSizing: 'border-box' }} />
            {davrNomi(d.oy, tilLocale())}
            {d.raqam ? <span style={{ color: 'var(--text-mute)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>№{d.raqam}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
