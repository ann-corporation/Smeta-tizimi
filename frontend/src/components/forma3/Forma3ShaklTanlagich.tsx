/** Forma-3 shakli tanlagichi: «To'liq» / «Bir qatorli» (+ paketda «Ikkalasi ham»). Hujjat yasalayotgan joyda ko'rsatiladi. */
import { t } from '../../i18n/til';
import type { Forma3Shakl } from '../../lib/forma3-export';
import type { PaketF3Tanlov } from '../../lib/forma3-shakl-tanlov';

type Props =
  | { paket?: false; qiymat: Forma3Shakl; onChange: (x: Forma3Shakl) => void; disabled?: boolean; className?: string }
  | { paket: true; qiymat: PaketF3Tanlov; onChange: (x: PaketF3Tanlov) => void; disabled?: boolean; className?: string };

export function Forma3ShaklTanlagich(p: Props) {
  return <label className={`flex items-center gap-1.5 text-[12px] text-text-dim ${p.className ?? ''}`}>
    <span>{t('Forma-3 shakli')}</span>
    <select
      className="rounded-md border border-border/60 bg-transparent px-1.5 py-1 text-[12px] text-text"
      aria-label={t('Forma-3 shakli')}
      value={p.qiymat}
      disabled={p.disabled}
      onChange={(e) => {
        const x = e.target.value;
        if (p.paket) p.onChange(x === 'ikkalasi' ? 'ikkalasi' : x === 'bir_qatorli' ? 'bir_qatorli' : 'toliq');
        else p.onChange(x === 'bir_qatorli' ? 'bir_qatorli' : 'toliq');
      }}
    >
      <option value="toliq">{t('To‘liq (ish turlari, hajm va narxlar bilan)')}</option>
      <option value="bir_qatorli">{t('Bir qatorli (faqat yig‘ma qator va jami)')}</option>
      {p.paket && <option value="ikkalasi">{t('Ikkalasi ham (to‘liq va bir qatorli)')}</option>}
    </select>
  </label>;
}
