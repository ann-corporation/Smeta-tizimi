/** Tizim xaritasi — «Oxirgi hodisalar» jonli lentasi (server: ko'pi bilan 20 ta; audit + signal + navbat xatolari). */
import type { TizimHodisa } from '../../../api/t2-tizim-xaritasi';
import { t } from '../../../i18n/til';
import { modulNomi, oldin } from '../../../lib/tizim-xaritasi';

const DARAJA_RANG: Record<string, string> = { critical: 'var(--danger)', error: 'var(--danger)', warning: 'var(--warn)' };

export function HodisaLenta({ hodisalar, onTanla, hozir }: { hodisalar: TizimHodisa[]; onTanla?: (id: string) => void; hozir?: number }) {
  if (!hodisalar.length) return <p className="px-4 py-3 text-[12.5px] text-text-mute">{t('7 kunda hodisa yo‘q')}</p>;
  return (
    <ol className="divide-y divide-[var(--border)]" data-testid="tizim-hodisalar" aria-live="polite">
      {hodisalar.map((h, i) => {
        const nishon = h.kompaniya_id != null && h.modul ? `modul:${h.kompaniya_id}:${h.modul}` : h.kompaniya_id != null ? `kompaniya:${h.kompaniya_id}` : null;
        const rang = DARAJA_RANG[h.daraja] ?? 'var(--border-strong)';
        const kimdan = h.kim_nom || h.kim || '';
        const joy = [h.kompaniya_nom, h.modul ? modulNomi(h.modul) : null].filter(Boolean).join(' · ');
        return (
          <li key={i}>
            <button type="button" disabled={!nishon || !onTanla} onClick={() => nishon && onTanla?.(nishon)}
              className="flex w-full gap-2 px-4 py-2 text-left hover:bg-[var(--surface-2)] disabled:cursor-default">
              <i aria-hidden className="mt-1.5 inline-block h-2 w-2 shrink-0 rotate-45 rounded-[1px]" style={{ background: rang }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] text-text" title={h.matn}>{h.matn}</span>
                <span className="block truncate text-[11.5px] text-text-dim">{[oldin(h.vaqt, hozir), joy, kimdan].filter(Boolean).join(' · ')}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
