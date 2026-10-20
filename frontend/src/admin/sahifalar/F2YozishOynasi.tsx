import { t } from '../../i18n/til';

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

const BELGI: Record<QadamHolat, { b: string; c: string }> = {
  kutish: { b: '○', c: 'text-text-mute' },
  ishlayapti: { b: '⏳', c: 'text-accent' },
  tayyor: { b: '✓', c: 'text-ok' },
  xato: { b: '✕', c: 'text-danger' },
  otkazildi: { b: '–', c: 'text-text-mute' },
};

export function F2YozishOynasi(p: { qadamlar: Qadam[]; natija?: string | null; band: boolean; onQayta: () => void; onYop: () => void }) {
  const xato = p.qadamlar.find((q) => q.holat === 'xato');
  const tugadi = !!p.natija;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={t('F2 ni yozish')}>
      <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-5 shadow-2xl">
        <h3 className="mb-3 text-[15px] font-bold text-text">{t('F2 ni yozish')}</h3>
        <ol className="space-y-2">
          {p.qadamlar.map((q, i) => (
            <li key={q.id} data-qadam={q.id} data-holat={q.holat} className="flex items-start gap-2 text-[13px]">
              <span className={`w-5 shrink-0 text-center font-bold ${BELGI[q.holat].c}`} aria-hidden>{BELGI[q.holat].b}</span>
              <span className="min-w-0 flex-1">
                <span className={q.holat === 'kutish' ? 'text-text-dim' : 'text-text'}>{i + 1}. {q.nom}</span>
                {q.izoh && <span className={`block text-[12px] ${q.holat === 'xato' ? 'text-danger' : 'text-text-dim'}`}>{q.izoh}</span>}
              </span>
            </li>
          ))}
        </ol>
        {tugadi && <p role="status" className="mt-3 rounded-lg bg-ok/10 p-2 text-[13px] text-ok">{p.natija}</p>}
        {xato && !p.band && <p role="alert" className="mt-3 text-[12px] text-text-dim">{t('Hech narsa yo‘qolmadi: bajarilgan qadamlar saqlangan, qayta urinish takror yozuv yaratmaydi.')}</p>}
        <div className="mt-4 flex justify-end gap-2">
          {xato && !p.band && <button type="button" className="tugma tugma-asosiy" onClick={p.onQayta}>{t('Qayta urinish')}</button>}
          <button type="button" className="tugma" disabled={p.band} onClick={p.onYop}>{tugadi ? t('Yopish') : t('Ortga — ishni davom ettirish')}</button>
        </div>
      </div>
    </div>
  );
}
