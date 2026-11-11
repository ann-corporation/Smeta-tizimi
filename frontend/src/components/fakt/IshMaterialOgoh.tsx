import { AlertTriangle } from 'lucide-react';
import type { MoslikNatija } from '../../lib/ish-material-moslik';
import { ogohSon } from './birlikOgohMatn';
import { t } from '../../i18n/til';

const foiz = (u: number) => `${ogohSon(u * 100, 0)}%`;

/** Ish hajmi ↔ materiallar hajmi ogohlantirishi (bloklamaydi). `onTuzat` — «tuzatish taklifi» tugmasi (taklif hajmini kiritmaga qo'yadi). */
export function IshMaterialOgohBlok({ natija, onTuzat, tuzatNomi, className = '' }: { natija: MoslikNatija; onTuzat?: (qiymat: string) => void; tuzatNomi?: string; className?: string }) {
  const bir = natija.ishBirlik ?? '';
  return (
    <div role="status" data-testid="ish-material-ogoh" className={`flex items-start gap-1 rounded-[var(--radius-xs)] border border-warn/50 bg-warn/10 px-1.5 py-1 text-left text-[11px] leading-snug text-warn ${className}`}>
      <AlertTriangle size={12} aria-hidden="true" className="mt-0.5 shrink-0" />
      <span className="min-w-0">
        <span data-testid="ish-material-ogoh-matn">{t('Ish hajmi materiallarga mos emas: ish {ish} {bir}, materiallardan {taklif} {bir} chiqadi (material jami {mat} {mb}, farq {f}).', {
          ish: ogohSon(natija.kiritilgan), taklif: ogohSon(natija.taklif), bir, mat: ogohSon(natija.materialJami), mb: natija.materialBirlik, f: foiz(natija.farqUlush) })}</span>
        {onTuzat && <button type="button" tabIndex={-1} data-testid="ish-material-tuzat" onClick={() => onTuzat(String(natija.taklif))}
          className="ml-1.5 rounded-[var(--radius-xs)] border border-warn/60 px-1 font-semibold hover:bg-warn/20">{tuzatNomi ?? t('Tuzatish taklifi: {v}', { v: ogohSon(natija.taklif) })}</button>}
      </span>
    </div>
  );
}

/** Bir nechta ogohlantirish ro'yxati (F2 import / F2 tayyorlash): har qatorda ish nomi + blok. */
export function IshMaterialOgohRoyxat({ natijalar, onTuzat, tuzatNomi, sarlavha }: { natijalar: readonly MoslikNatija[]; onTuzat?: (n: MoslikNatija) => void; tuzatNomi?: (n: MoslikNatija) => string; sarlavha?: string }) {
  if (!natijalar.length) return null;
  return (
    <section data-testid="ish-material-royxat" aria-label={t('Ish va material hajmi muvofiqligi')} className="mb-3 rounded-[var(--radius-sm)] border border-warn/40 bg-warn/5 p-2">
      <p className="mb-1 text-[12px] font-semibold text-warn">{sarlavha ?? t('Ish hajmi materiallar hajmiga mos kelmaydigan qatorlar: {n}', { n: String(natijalar.length) })}</p>
      <ul className="flex flex-col gap-1">
        {natijalar.map((n) => (
          <li key={n.ishId ?? n.ishNom} className="text-[12px] text-text">
            <div className="truncate font-medium" title={n.ishNom ?? ''}>{n.ishNom}</div>
            <IshMaterialOgohBlok natija={n} onTuzat={onTuzat ? () => onTuzat(n) : undefined} tuzatNomi={tuzatNomi?.(n)} />
          </li>
        ))}
      </ul>
    </section>
  );
}
