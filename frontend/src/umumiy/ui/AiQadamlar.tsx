import { useState } from 'react';
import { ChevronDown, ChevronRight, ListChecks, Loader2 } from 'lucide-react';
import type { Qadam } from '../../api/t2-agent-ish';
import { t } from '../../i18n/til';

/** Texnik qadamlar («kim/lavozim/kontekst aniqlanmoqda») chatda alohida qator bo'lib ko'rinmaydi — faqat ochilgan tafsilot ichida. */
const TEXNIK = new Set(['🔐', '👤', '🗄️', '📜', '🤖']);

/**
 * «AI qanday ishladi» — IXCHAM: doim BIR qator (jonli rejimda oxirgi mazmunli qadam shu qatorda almashadi). Tafsilot (har qadam va vaqti)
 * faqat bosilganda ochiladi — chat qadamlar bilan to'lib ketmaydi.
 */
export function AiQadamlar({ qadamlar, jonli = false }: { qadamlar: Qadam[]; jonli?: boolean }) {
  const [och, setOch] = useState(false);
  if (!qadamlar.length && !jonli) return null;
  const sekund = qadamlar.length ? (qadamlar[qadamlar.length - 1].ms / 1000).toFixed(1) : '0.0';
  const oxirgi = [...qadamlar].reverse().find((q) => !TEXNIK.has(q.belgi)) ?? qadamlar[qadamlar.length - 1];
  return (
    <div className="mt-2 rounded-lg border border-border/70 bg-surface/60 text-[11px]" data-agent-action="ai_qadamlar">
      <button type="button" onClick={() => setOch(!och)} aria-expanded={och} disabled={!qadamlar.length}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-text-dim hover:text-text">
        {jonli ? <Loader2 size={12} className="shrink-0 animate-spin text-accent" /> : <ListChecks size={12} className="shrink-0 text-accent" />}
        <span className="shrink-0 font-medium">{jonli ? t('AI ishlayapti…') : t('AI qanday ishladi')}</span>
        {jonli && oxirgi ? <span className="min-w-0 flex-1 truncate text-text-mute" data-testid="ai-qadam-oxirgi">· {oxirgi.matn}</span>
          : <span className="text-text-mute">· {qadamlar.length} {t('qadam')} · {sekund} s</span>}
        {qadamlar.length > 0 && <span className="ml-auto shrink-0">{och ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>}
      </button>
      {och && (
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
