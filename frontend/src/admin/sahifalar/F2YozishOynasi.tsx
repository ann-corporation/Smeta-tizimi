import { AlertTriangle, CheckCircle2, Circle, Loader2, MinusCircle } from 'lucide-react';
import { t } from '../../i18n/til';
import { F2Oyna } from './F2Oyna';

/**
 * «F2 ni yozish» jarayoni (egasi 2026-10-20: «oxirida faqat ishda kutish mumkin — foydalanuvchiga har bir qadamni
 * ko'rsatib bera olishi kerak»). Ish davomidagi hamma amal qoralamada; serverga faqat shu oynadagi qadamlar yozadi.
 * Xato bo'lsa — qaysi qadamda va nima uchun; «Qayta urinish» o'sha qadamdan davom etadi (operatsiyalar idempotent).
 */
export type QadamId = 'tekshiruv' | 'ozgarish' | 'fayl' | 'qoralama' | 'akt';
export type QadamHolat = 'kutish' | 'ishlayapti' | 'tayyor' | 'xato' | 'otkazildi';
export interface Qadam { id: QadamId; nom: string; holat: QadamHolat; izoh?: string }

export const BOSH_QADAMLAR = (): Qadam[] => [
  { id: 'tekshiruv', nom: t('Tekshiruv'), holat: 'kutish' },
  { id: 'ozgarish', nom: t('Qo‘shimcha va zamenalarni smetaga yozish'), holat: 'kutish' },
  { id: 'fayl', nom: t('Manba F2 faylini saqlash'), holat: 'kutish' },
  { id: 'qoralama', nom: t('Ish qoralamasini serverga saqlash'), holat: 'kutish' },
  { id: 'akt', nom: t('F2 aktini yozish'), holat: 'kutish' },
];

const YOL_SINF: Record<QadamHolat, string> = { kutish: '', ishlayapti: 'fz-yol__q--now', tayyor: 'fz-yol__q--done', xato: 'fz-yol__q--bad', otkazildi: 'fz-yol__q--done' };
const holatSozi = (h: QadamHolat): string => ({
  kutish: t('navbatda'), ishlayapti: t('bajarilmoqda…'), tayyor: t('tayyor'), xato: t('xato'), otkazildi: t('o‘tkazildi'),
})[h];
const BELGI: Record<QadamHolat, { ikon: typeof Circle; rang: string }> = {
  kutish: { ikon: Circle, rang: 'var(--text-mute)' },
  ishlayapti: { ikon: Loader2, rang: 'var(--accent-text)' },
  tayyor: { ikon: CheckCircle2, rang: 'var(--ok)' },
  xato: { ikon: AlertTriangle, rang: 'var(--danger)' },
  otkazildi: { ikon: MinusCircle, rang: 'var(--text-mute)' },
};

export function F2YozishOynasi(p: { qadamlar: Qadam[]; natija?: string | null; band: boolean; onQayta: () => void; onYop: () => void }) {
  const xato = p.qadamlar.find((q) => q.holat === 'xato');
  const tugadi = !!p.natija;
  const jamiQadam = p.qadamlar.length;
  const tafsilot = p.qadamlar.filter((q) => !!q.izoh);
  const bajarilgan = p.qadamlar.filter((q) => q.holat === 'tayyor' || q.holat === 'otkazildi').length;
  return (
    <F2Oyna label={t('F2 ni yozish')} kenglik={760} onYop={p.band ? undefined : p.onYop}>
      <div className="fz-card__head">
        <div className="min-w-0">
          <h3 className="fz-card__title">{t('F2 ni yozish')}</h3>
          <p className="fz-card__sub">{xato ? t('Qadamda xato chiqdi — pastda sababi ko‘rsatilgan.') : tugadi ? t('Hammasi yozildi.') : t('Har qadam shu yerda ko‘rinadi; sahifani yopmang.')}</p>
        </div>
        <span className={`fz-stamp ${xato ? 'fz-stamp--danger' : tugadi ? 'fz-stamp--ok' : 'fz-stamp--info'}`}>{bajarilgan}/{jamiQadam}</span>
      </div>
      <div className="fz-card__body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <ol className="fz-yol m-0 list-none p-0" aria-label={t('Yozish qadamlari')}>
          {p.qadamlar.map((q, i) => (
            <li key={q.id} data-qadam={q.id} data-holat={q.holat} className={`fz-yol__q ${YOL_SINF[q.holat]}`} aria-current={q.holat === 'ishlayapti' ? 'step' : undefined}>
              <span className="fz-yol__nuqta" aria-hidden="true" />
              <span className="fz-yol__nom">{i + 1}. {q.nom}</span>
              <span className="fz-yol__izoh" style={q.holat === 'xato' ? { color: 'var(--danger)', fontWeight: 600 } : undefined}>{holatSozi(q.holat)}</span>
            </li>
          ))}
        </ol>
        {tafsilot.length > 0 && (
          <ul className="fz-check m-0 list-none p-0" aria-label={t('Qadam tafsilotlari')}>
            {tafsilot.map((q) => {
              const B = BELGI[q.holat];
              return (
                <li key={q.id} className={`fz-check__q ${q.holat === 'xato' ? 'fz-check__q--bad' : q.holat === 'tayyor' ? 'fz-check__q--ok' : ''}`}>
                  <B.ikon aria-hidden className={q.holat === 'ishlayapti' ? 'animate-spin' : ''} style={{ color: B.rang }} />
                  <span className="min-w-0 flex-1" style={{ overflowWrap: 'anywhere' }}>
                    <b className="font-semibold text-text">{q.nom}</b>
                    <span className="block" style={q.holat === 'xato' ? { color: 'var(--danger)' } : undefined}>{q.izoh}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {tugadi && <p role="status" className="fz-note fz-note--info m-0" style={{ borderColor: 'color-mix(in srgb, var(--ok) 40%, transparent)', background: 'var(--ok-soft)' }}><CheckCircle2 style={{ color: 'var(--ok)' }} aria-hidden />{p.natija}</p>}
        {xato && !p.band && <p role="alert" className="fz-note m-0"><AlertTriangle aria-hidden />{t('Hech narsa yo‘qolmadi: bajarilgan qadamlar saqlangan, qayta urinish takror yozuv yaratmaydi.')}</p>}
      </div>
      <div className="flex justify-end gap-2 border-t border-border bg-surface-2 px-5 py-3">
        {xato && !p.band && <button type="button" className="fz-btn fz-btn--primary" data-boshlang-fokus onClick={p.onQayta}>{t('Qayta urinish')}</button>}
        <button type="button" className="fz-btn" disabled={p.band} data-boshlang-fokus={tugadi || undefined} onClick={p.onYop}>{tugadi ? t('Yopish') : t('Ortga — ishni davom ettirish')}</button>
      </div>
    </F2Oyna>
  );
}
