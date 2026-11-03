import { AlertTriangle } from 'lucide-react';
import type { BirlikOgoh } from '../../lib/fakt-birlik-ogoh';
import { birlikOgohMatn, ogohSon } from './birlikOgohMatn';
import { t } from '../../i18n/til';

/** Qator yonidagi ogohlantirish (bloklamaydi). `onTuzat` berilsa va taklif bor — «3,00 qilib qo'yish» tugmasi. */
export function BirlikOgohBlok({ ogoh, onTuzat, tur = 'kiritish', className = '' }: { ogoh: BirlikOgoh; onTuzat?: (qiymat: string) => void; tur?: 'kiritish' | 'fakt'; className?: string }) {
  return (
    <div role="status" data-testid="birlik-ogoh" className={`flex items-start gap-1 rounded-[var(--radius-xs)] border border-warn/50 bg-warn/10 px-1.5 py-1 text-left text-[11px] leading-snug text-warn ${className}`}>
      <AlertTriangle size={12} aria-hidden="true" className="mt-0.5 shrink-0" />
      <span className="min-w-0">
        <span data-testid="birlik-ogoh-matn">{birlikOgohMatn(ogoh, tur)}</span>
        {onTuzat && ogoh.taklif != null && <button type="button" tabIndex={-1} data-testid="birlik-tuzat" onClick={() => onTuzat(String(ogoh.taklif))}
          className="ml-1.5 rounded-[var(--radius-xs)] border border-warn/60 px-1 font-semibold hover:bg-warn/20">{t('{v} qilib qo‘yish', { v: ogohSon(ogoh.taklif, 2) })}</button>}
      </span>
    </div>
  );
}
