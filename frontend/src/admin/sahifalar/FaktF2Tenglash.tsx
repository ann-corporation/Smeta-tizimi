import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { yangiOperationId } from '../../api/supabase';
import { sbFaktYoz } from '../../api/t2-fakt';
import type { AktBekorFn, TenglashReja } from '../../lib/fakt-f2-tenglash';
import { t } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';

const fmt = (v: number | null | undefined) => (v == null ? '—' : Number(v).toLocaleString('ru-RU', { maximumFractionDigits: 3 }));

/**
 * «Fakt = F2» oldindan ko'rish: qaysi qatorlar, qancha hajm/summa fakt ga qo'shiladi. «Qo'llash» — BITTA fakt hujjati
 * (fakt_yoz_v2); xabarda «Bekor qilish» — shu hujjatni qaytaradi (akt_bekor). Smeta qatorlariga tegilmaydi.
 */
export function FaktF2Tenglash({ sarlavha, reja, obyektId, sana, onYop, onBajarildi, aktBekor }: {
  sarlavha: string; reja: TenglashReja; obyektId: number; sana: string;
  onYop: () => unknown; onBajarildi: () => unknown;
  /** Hujjatni bekor qilish (akt_bekor). */
  aktBekor: AktBekorFn;
}) {
  const [band, setBand] = useState(false);
  const operationId = useRef(yangiOperationId());
  const qollash = async () => {
    if (band || !reja.paket.length) return;
    setBand(true);
    try {
      const r = await sbFaktYoz({ obyektId, sana, operationId: operationId.current, qatorlar: reja.paket, izoh: `Fakt = F2: ${reja.paket.length} qator` });
      if (!r.ok) { toast(r.error || r.xabar || t('Fakt saqlanmadi.'), 'danger'); return; }
      const aktId = r.akt_id;
      toast(`${t('Fakt F2 ga tenglashtirildi')}: ${reja.paket.length} ${t('qator')}`, 'ok', undefined, 12000, aktId ? {
        label: 'Bekor qilish',
        onClick: () => { void aktBekor(aktId).then((b) => { if (b.ok) { toast(t('Fakt = F2 bekor qilindi.'), 'ok'); void onBajarildi(); } else toast(b.error || t('Bekor qilinmadi.'), 'danger'); }); },
      } : undefined);
      onYop();
      await onBajarildi();
    } catch { toast(t('Javob olinmadi. Qayta urining — takror xavfsiz (bir xil amal ID).'), 'danger'); }
    finally { setBand(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={t('Fakt = F2')}>
      <div className="karta flex max-h-[85vh] w-full max-w-3xl flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[14px] font-semibold text-text">{t('Fakt = F2')}</h2>
            <p className="truncate text-[12px] text-text-dim" title={sarlavha}>{sarlavha}</p>
          </div>
          <button type="button" onClick={onYop} aria-label={t('Yopish')} className="rounded p-1 text-text-mute hover:text-text"><X size={16} /></button>
        </div>
        {reja.qatorlar.length === 0
          ? <p className="text-[13px] text-text-dim">{t('Fakt allaqachon F2 ga teng yoki undan ko‘p — qo‘shiladigan hajm yo‘q.')}</p>
          : <>
            <p className="text-[12px] text-text-dim">{t('Faqat F2 hajmi fakt dan KO‘P bo‘lgan qatorlarga farq qo‘shiladi. Mehnat va mashina norma bo‘yicha o‘zi ergashadi.')}</p>
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full text-[12px]">
                <thead><tr className="border-b border-border text-left text-text-mute">
                  <th className="px-1">{t('Qator')}</th><th className="px-1 text-right">{t('Fakt')}</th><th className="px-1 text-right">F2</th>
                  <th className="px-1 text-right">{t('Qo‘shiladi')}</th><th className="px-1 text-right">{t('Summa')}</th>
                </tr></thead>
                <tbody>{reja.qatorlar.map((q) => (
                  <tr key={q.id} className="border-b border-border/40">
                    <td className="max-w-[320px] truncate px-1" title={q.nom}>{q.nom}{q.tur === 'ob' ? ` · ${t('uskuna')}` : q.tur === 'mat' ? ` · ${t('material')}` : ''}{q.avtomatik > 0 ? ` · +${q.avtomatik} ${t('mehnat/mashina avtomatik')}` : ''}</td>
                    <td className="px-1 text-right tabular-nums">{fmt(q.fakt)}</td>
                    <td className="px-1 text-right tabular-nums">{fmt(q.f2)}</td>
                    <td className="px-1 text-right font-semibold tabular-nums">+{fmt(q.delta)} {q.birlik ?? ''}</td>
                    <td className="px-1 text-right tabular-nums">{q.summa == null ? '—' : fmt(q.summa)}</td>
                  </tr>))}</tbody>
              </table>
            </div>
          </>}
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-2 text-[12px]">
          <span className="font-semibold text-text">{reja.qatorlar.length} {t('qator')}</span>
          <span className="text-text-dim">{t('Jami summa')}: {fmt(reja.jamiSumma)}</span>
          {reja.narxsiz > 0 && <span className="text-warn">{reja.narxsiz} {t('qatorda narx yo‘q')}</span>}
          {reja.otkazildi.manfiyReja > 0 && <span className="text-text-mute">{reja.otkazildi.manfiyReja} {t('chegirma qatori o‘tkazib yuborildi')}</span>}
          <span className="text-text-mute">{t('Sana')}: {sana}</span>
          <div className="ml-auto flex gap-2">
            <button type="button" className="tugma" onClick={onYop}>{t('Bekor')}</button>
            <button type="button" className="tugma tugma-asosiy" disabled={band || reja.paket.length === 0} onClick={() => void qollash()}>{band ? t('Yozilmoqda…') : t('Qo‘llash')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
