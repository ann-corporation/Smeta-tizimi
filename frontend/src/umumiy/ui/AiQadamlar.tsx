import { useState } from 'react';
import { ChevronDown, ChevronRight, ListChecks, Loader2 } from 'lucide-react';
import type { Qadam } from '../../api/t2-agent-ish';
import { t } from '../../i18n/til';

/** «AI qanday ishladi» — har qadam: nima qilindi va qancha vaqtda. Jonli rejimda (savol ketayotganda) har yangi qadam darhol ko'rinadi. */
export function AiQadamlar({ qadamlar, jonli = false }: { qadamlar: Qadam[]; jonli?: boolean }) {
  const [och, setOch] = useState(false);
  if (!qadamlar.length && !jonli) return null;
  const ochiq = och || jonli;
  const sekund = qadamlar.length ? (qadamlar[qadamlar.length - 1].ms / 1000).toFixed(1) : '0.0';
  return (
    <div className="mt-2 rounded-lg border border-border/70 bg-surface/60 text-[11px]" data-agent-action="ai_qadamlar">
      <button type="button" onClick={() => setOch(!och)} aria-expanded={ochiq} disabled={jonli}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-text-dim hover:text-text">
        {jonli ? <Loader2 size={12} className="animate-spin text-accent" /> : <ListChecks size={12} className="text-accent" />}
        <span className="font-medium">{jonli ? t('AI ishlayapti…') : t('AI qanday ishladi')}</span>
        <span className="text-text-mute">· {qadamlar.length} {t('qadam')} · {sekund} s</span>
        {!jonli && <span className="ml-auto">{ochiq ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>}
      </button>
      {ochiq && (
        <ol className="space-y-1 border-t border-border/60 px-2.5 py-2" aria-label={t('AI qadamlari')}>
          {qadamlar.map((q, i) => (
            <li key={i} className={`flex gap-1.5 ${jonli && i === qadamlar.length - 1 ? 'text-text' : 'text-text-dim'}`}>
              <span aria-hidden>{q.belgi}</span>
              <span className="flex-1">{q.matn}</span>
              <span className="tabular-nums text-text-mute">{(q.ms / 1000).toFixed(1)}s</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
