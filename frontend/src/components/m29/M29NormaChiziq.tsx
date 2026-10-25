import { t } from '../../i18n/til';
import type { M29Nisbat } from '../../lib/m29-korinish';

/**
 * Norma ↔ fakt chizig'i: norma — tik belgi (100%), fakt — to'ldirilgan chiziq. Normadan oshgan qism qizil,
 * tejalgan bo'shliq — shtrixli. Yonida so'z bilan: «ortiqcha 12%» / «tejaldi 8%» (belgi emas).
 */
const foizMatn = (x: number) => (x >= 10 ? Math.round(x).toString() : x.toLocaleString('ru-RU', { maximumFractionDigits: 1 }));

function m29HolatMatni(n: M29Nisbat): { matn: string; rang: string } {
  switch (n.holat) {
    case 'ortiqcha': return { matn: t('ortiqcha {f}%', { f: foizMatn(n.farqFoiz ?? 0) }), rang: 'var(--danger)' };
    case 'tejaldi': return { matn: t('tejaldi {f}%', { f: foizMatn(n.farqFoiz ?? 0) }), rang: 'var(--ok)' };
    case 'mos': return { matn: t('normada'), rang: 'var(--text-dim)' };
    case 'faktYoq': return { matn: t('fakt noma’lum'), rang: 'var(--warn)' };
    case 'normasiz': return { matn: t('normasiz chiqim'), rang: 'var(--danger)' };
    default: return { matn: '—', rang: 'var(--text-mute)' };
  }
}

export function M29NormaChiziq({ n, izoh }: { n: M29Nisbat; izoh?: string }) {
  const { matn, rang } = m29HolatMatni(n);
  const normaFoiz = n.normaJoy * 100;
  const faktFoiz = n.faktUzun * 100;
  const ichki = Math.min(faktFoiz, normaFoiz || faktFoiz);
  const oshgan = n.holat === 'ortiqcha' || n.holat === 'normasiz';
  return (
    <span className="flex min-w-[150px] items-center gap-2" title={izoh} data-testid="m29-chiziq" data-holat={n.holat}>
      <span className="relative h-2.5 flex-1 overflow-hidden rounded-sm" style={{ background: 'var(--surface-3)' }} aria-hidden="true">
        {n.holat === 'tejaldi' && (
          <i className="absolute inset-y-0" style={{ left: `${faktFoiz}%`, width: `${normaFoiz - faktFoiz}%`, background: 'repeating-linear-gradient(135deg, var(--ok-soft) 0 3px, transparent 3px 6px)', boxShadow: 'inset 0 0 0 1px var(--ok-soft)' }} />
        )}
        {n.holat === 'faktYoq' && (
          <i className="absolute inset-y-0 left-0" style={{ width: `${normaFoiz}%`, background: 'repeating-linear-gradient(135deg, var(--warn-soft) 0 3px, transparent 3px 6px)' }} />
        )}
        {n.holat !== 'normasiz' && faktFoiz > 0 && (
          <i className="absolute inset-y-0 left-0" style={{ width: `${ichki}%`, background: n.holat === 'tejaldi' ? 'var(--ok)' : 'var(--accent)' }} />
        )}
        {oshgan && (
          <i className="absolute inset-y-0" style={{ left: `${n.holat === 'normasiz' ? 0 : normaFoiz}%`, width: `${faktFoiz - (n.holat === 'normasiz' ? 0 : normaFoiz)}%`, background: 'var(--danger)' }} />
        )}
        {normaFoiz > 0 && (
          <i className="absolute -inset-y-px w-0.5" style={{ left: `calc(${normaFoiz}% - 1px)`, background: 'var(--text)' }} />
        )}
      </span>
      <span className="min-w-[84px] whitespace-nowrap text-[11.5px] font-semibold tabular-nums" style={{ color: rang }}>
        {matn}{n.kesilgan ? ' ≫' : ''}
      </span>
    </span>
  );
}
