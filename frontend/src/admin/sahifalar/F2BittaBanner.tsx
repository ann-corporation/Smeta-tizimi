import { AlertTriangle } from 'lucide-react';
import { t } from '../../i18n/til';
import type { OyTakror } from '../../lib/f2-bitta-qoida';

/** «Obyekt x oy = bitta F-2» buzilganda qizil banner: obyekt, oy va ikkala aktga havola (F-2 tarixi). */
export function F2BittaBanner({ takrorlar, obyektNom }: { takrorlar: readonly OyTakror[]; obyektNom?: (id: number) => string | null }) {
  if (!takrorlar.length) return null;
  return (
    <div role="alert" data-testid="f2-bitta-banner" className="rounded-lg border border-danger/60 bg-danger/10 p-2 text-[12px]">
      <b className="inline-flex items-center gap-1 text-danger"><AlertTriangle size={14} aria-hidden="true" />{t('Bu obyektda shu oy uchun 2 ta F-2 bor')}</b>
      <p className="mt-1 text-text-dim">{t('Obyekt x oy = bitta F-2. Ortiqchasini (masalan, taxminiy qoralamani) bekor qiling — aks holda paket va Forma 3 yig‘ilmaydi.')}</p>
      <ul className="mt-1 list-disc pl-5">
        {takrorlar.map((x) => (
          <li key={`${x.obyektId}|${x.oy}`}>
            {obyektNom?.(x.obyektId) ?? `#${x.obyektId}`} · {x.oy}:{' '}
            {x.aktlar.map((a, i) => (
              <span key={a.id}>{i > 0 && ', '}<a href={`/admin/f2-tarix?obyekt=${x.obyektId}`} className="underline">{`№ ${a.raqam ?? a.id}${x.taxminiyIds.includes(a.id) ? ` (${t('taxminiy')})` : ''}`}</a></span>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

