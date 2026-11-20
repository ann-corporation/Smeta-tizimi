/**
 * F2QatorTakliflari - texnadzor takliflari F-2 qoralama muharririda HAR QATOR USTIDA (belgi + izoh + taklif qilingan qiymat + Qabul/Rad/Keyinroq).
 * Umumiy blok (F2TekshiruvTakliflari) qoladi; u ma'lumotni yuklaydi va qaror/preview mantig'ini yuritadi, bu yerga kichik umumiy xotira (store)
 * orqali beradi - mantiq ikki joyda takrorlanmaydi. Qator qo'shish taklifi: fakt bo'lsa «Qabul» qatorni muharrirga qo'shadi (hajm kiritiladi),
 * qaror yoziladi; F-2 ni saqlash PTO da qoladi (mavjud saqlash yo'li).
 */
import { useMemo, useState, useSyncExternalStore } from 'react';
import { Check, X } from 'lucide-react';
import { t } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';
import type { AktTaklif } from '../../lib/tekshiruv/pto';
import { holatOl, obuna, qatorTakliflari } from './f2-takliflar-store';

const BAYROQ_MATN = { olib_tashlansin: 'Olib tashlansin', hajm_notogri: 'Hajm noto‘g‘ri', hujjat_kerak: 'Hujjat kerak', qabul: 'Qabul' } as const;
const son = (v: number | null | undefined) => (v == null ? '—' : Number(v).toLocaleString('ru-RU', { maximumFractionDigits: 6 }));

type Props = {
  qatorId: number;
  /** Fakt qoldig'i (muharrirda shu qator uchun «mumkin» hajm). null/0 - fakt yo'q: qator qo'shib bo'lmaydi. */
  mumkin: number | null;
  /** Qatorni muharrirga qo'shadi (hajm kiritiladi). */
  qoshish: (hajm: number) => void;
};

export function F2QatorTakliflari({ qatorId, mumkin, qoshish }: Props) {
  const h = useSyncExternalStore(obuna, holatOl, holatOl);
  const royxat = useMemo(() => qatorTakliflari(h.takliflar, qatorId), [h.takliflar, qatorId]);
  const [rad, setRad] = useState<{ id: number; sabab: string } | null>(null);
  if (royxat.length === 0 || !h.amallar) return null;
  const a = h.amallar;
  const faktBor = mumkin != null && mumkin > 0;

  const qabul = async (x: AktTaklif) => {
    if (x.qosh) {
      if (!faktBor) { toast(t('Fakt qoldig‘i yo‘q: qator qo‘shib bo‘lmaydi'), 'danger'); return; }
      qoshish(x.taklif_hajm != null && x.taklif_hajm > 0 ? Math.min(x.taklif_hajm, mumkin as number) : (mumkin as number));
      if (await a.qaror(x, 'qabul')) toast(t('Qator F-2 ga qo‘shildi: F-2 ni saqlang'), 'ok');
      return;
    }
    a.qabul(x);
  };

  return (
    <div className="mt-1 flex flex-col gap-1" data-testid={`qator-takliflari-${qatorId}`}>
      {royxat.map((x) => {
        const hal = x.qaror !== 'kutilmoqda';
        return (
          <div key={x.id} className="rounded border px-2 py-1 text-[12px] flex flex-col gap-0.5" style={{ borderColor: '#54aeff', background: 'rgba(221,244,255,.35)' }} data-testid={`qator-taklif-${x.id}`}>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-medium">{t('Texnadzor taklifi')}</span>
              {x.bayroq && <span className="rounded px-1.5" style={{ background: '#ddf4ff' }}>{t(BAYROQ_MATN[x.bayroq])}{x.hujjat_turi ? ` · ${x.hujjat_turi}` : ''}</span>}
              {x.qosh && <span className="rounded px-1.5" style={{ background: '#ddf4ff' }}>{t('Qo‘shish taklifi')}</span>}
              {hal && <span className="rounded px-1.5" style={{ background: x.qaror === 'qabul' ? '#dafbe1' : '#ffebe9' }}>{t(x.qaror === 'qabul' ? 'Qabul qilindi' : x.qaror === 'rad' ? 'Rad etildi' : 'Keyinroq')}</span>}
            </div>
            {x.taklif_hajm != null && <div>{t('Hajm')}: {son(x.joriy_hajm)} → <b>{son(x.taklif_hajm)}</b> {x.birlik ?? ''}</div>}
            {x.izoh && <div className="opacity-90">{x.izoh}</div>}
            {x.qosh && !faktBor && !hal && <div style={{ color: '#9a6700' }}>{t('Fakt qoldig‘i yo‘q: qator qo‘shib bo‘lmaydi')}</div>}
            {!hal && (
              <div className="flex flex-wrap gap-1.5">
                <button type="button" className="fz-btn fz-btn--primary fz-btn--sm" disabled={a.band || (x.qosh && !faktBor)} onClick={() => void qabul(x)}><Check size={12} aria-hidden="true" /> {t('Qabul')}</button>
                <button type="button" className="fz-btn fz-btn--sm" disabled={a.band} onClick={() => setRad({ id: x.id, sabab: '' })}><X size={12} aria-hidden="true" /> {t('Rad')}</button>
                <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm" disabled={a.band} onClick={() => void a.qaror(x, 'keyinroq')}>{t('Keyinroq')}</button>
              </div>
            )}
            {rad?.id === x.id && (
              <div className="flex flex-col gap-1">
                <textarea className="fz-input" rows={2} maxLength={1000} value={rad.sabab} onChange={(e) => setRad({ id: x.id, sabab: e.target.value })} placeholder={t('Rad etish sababi (tekshiruvchi ko‘radi)')} aria-label={t('Rad etish sababi')} />
                <div className="flex gap-1.5">
                  <button type="button" className="fz-btn fz-btn--danger fz-btn--sm" disabled={rad.sabab.trim().length < 3} onClick={() => void a.qaror(x, 'rad', rad.sabab.trim()).then((ok) => { if (ok) setRad(null); })}>{t('Rad etish')}</button>
                  <button type="button" className="fz-btn fz-btn--ghost fz-btn--sm" onClick={() => setRad(null)}>{t('Bekor')}</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
