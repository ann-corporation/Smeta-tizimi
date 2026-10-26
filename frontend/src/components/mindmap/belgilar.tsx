/**
 * Kompaniya xaritasi uchun umumiy kichik vizual bo‘laklar (Firuza tokenlari bilan): holat rombi, holat chizig‘i,
 * bajarilish o‘lchagichi, halqa diagramma. Ranglar faqat CSS o‘zgaruvchilaridan — ikkala mavzuda ishlaydi.
 */
import { t } from '../../i18n/til';
import { HOLAT_TARTIB, type HolatSanoq, type XHolat } from '../../lib/mindmap-korinish';
import { HOLAT_RANG, foizMatn, holatNomi } from './holat';

/** Girih rombi (45°) — holat belgisi. */
export function Romb({ holat, olcham = 10, className = '' }: { holat: XHolat; olcham?: number; className?: string }) {
  return (
    <span aria-hidden className={'inline-block shrink-0 ' + className}
      style={{ width: olcham, height: olcham, transform: 'rotate(45deg)', background: HOLAT_RANG[holat], borderRadius: 2 }} />
  );
}

/** Holatlar bo‘yicha taqsimot chizig‘i. */
export function HolatChiziq({ sanoq, balandlik = 8, className = '' }: { sanoq: HolatSanoq; balandlik?: number; className?: string }) {
  const jami = HOLAT_TARTIB.reduce((n, h) => n + sanoq[h], 0);
  const izoh = HOLAT_TARTIB.filter((h) => sanoq[h] > 0).map((h) => holatNomi(h) + ': ' + sanoq[h]).join(' · ');
  return (
    <div className={'flex w-full overflow-hidden ' + className} role="img" aria-label={izoh || t('Obyekt yo‘q')}
      style={{ height: balandlik, gap: jami ? 2 : 0, borderRadius: 3, background: 'var(--surface-3)' }}>
      {HOLAT_TARTIB.map((h) => sanoq[h] > 0 && (
        <i key={h} style={{ display: 'block', flex: sanoq[h], background: HOLAT_RANG[h], minWidth: 3 }} />
      ))}
    </div>
  );
}

/** Bajarilish: F2 bilan topshirilgan (firuza) + bajarilgan, lekin F2 siz (lojuvard) / smeta = 100%. */
export function Bajarilish({ faktFoiz, f2Foiz, katta = false, smetaBor = true, matn }: { faktFoiz: number | null; f2Foiz: number | null; katta?: boolean; smetaBor?: boolean; /** O‘ngdagi yozuv (sukut — F2 foizi). */ matn?: string }) {
  if (!smetaBor || (faktFoiz == null && f2Foiz == null)) {
    return (
      <div className="fz-meter" aria-label={t('Smeta yo‘q — foiz hisoblanmaydi')}>
        <div className="fz-meter__t" style={{ height: katta ? 14 : 8, background: 'repeating-linear-gradient(135deg, var(--surface-3) 0 6px, transparent 6px 10px)' }} />
        <span className="fz-meter__f">—</span>
      </div>
    );
  }
  const f2 = Math.max(0, Math.min(100, f2Foiz ?? 0));
  const fakt = Math.max(f2, Math.min(100, faktFoiz ?? 0));
  const oshgan = (faktFoiz ?? 0) > 100 || (f2Foiz ?? 0) > 100;
  return (
    <div className={'fz-meter' + (katta ? ' fz-meter--lg' : '') + (oshgan ? ' fz-meter--over' : '')}
      role="img" aria-label={t('F2: {f2} · bajarilgan: {fakt}', { f2: foizMatn(f2Foiz), fakt: foizMatn(faktFoiz) })}>
      <div className="fz-meter__t">
        <i className="fz-meter__shu" style={{ width: f2 + '%' }} />
        <i className="fz-meter__fakt" style={{ width: (fakt - f2) + '%' }} />
      </div>
      <span className="fz-meter__f">{matn ?? foizMatn(f2Foiz)}</span>
    </div>
  );
}

/** Halqa diagramma — holatlar taqsimoti, markazda obyektlar soni. */
export function HolatHalqa({ sanoq, olcham = 112, onTanla, faol }: { sanoq: HolatSanoq; olcham?: number; onTanla?: (h: XHolat) => void; faol?: XHolat | null }) {
  const jami = HOLAT_TARTIB.reduce((n, h) => n + sanoq[h], 0);
  const r = olcham / 2 - 8, c = 2 * Math.PI * r;
  let siljish = 0;
  return (
    <svg width={olcham} height={olcham} viewBox={`0 0 ${olcham} ${olcham}`} role="img"
      aria-label={HOLAT_TARTIB.map((h) => holatNomi(h) + ': ' + sanoq[h]).join(' · ')}>
      <circle cx={olcham / 2} cy={olcham / 2} r={r} fill="none" style={{ stroke: 'var(--surface-3)' }} strokeWidth={12} />
      {jami > 0 && HOLAT_TARTIB.map((h) => {
        if (!sanoq[h]) return null;
        const uz = (sanoq[h] / jami) * c;
        const el = (
          <circle key={h} cx={olcham / 2} cy={olcham / 2} r={r} fill="none" strokeWidth={faol === h ? 16 : 12}
            style={{ stroke: HOLAT_RANG[h], cursor: onTanla ? 'pointer' : undefined, transition: 'stroke-width .15s' }}
            strokeDasharray={`${Math.max(0, uz - 2)} ${c - Math.max(0, uz - 2)}`} strokeDashoffset={-siljish}
            transform={`rotate(-90 ${olcham / 2} ${olcham / 2})`} onClick={onTanla ? () => onTanla(h) : undefined}>
            <title>{holatNomi(h) + ': ' + sanoq[h]}</title>
          </circle>
        );
        siljish += uz;
        return el;
      })}
      <text x="50%" y="47%" textAnchor="middle" style={{ fill: 'var(--text)', font: '600 24px var(--font-display)' }}>{jami}</text>
      <text x="50%" y="64%" textAnchor="middle" style={{ fill: 'var(--text-mute)', font: '500 10.5px var(--font-sans)' }}>{t('obyekt')}</text>
    </svg>
  );
}
