import { useState } from 'react';
import { t } from '../../i18n/til';
import type { HisobotIshonch, MoslashHisoboti } from '../../lib/f2-moslash-v3/moslashHisoboti';

const BELGI: Record<HisobotIshonch, string> = { aniq: '✓', ehtimol: '◐', topilmadi: '✕', otkazildi: '–' };
const ishonchNomi = (x: HisobotIshonch): string => (x === 'aniq' ? t('aniq') : x === 'ehtimol' ? t('ehtimol') : x === 'topilmadi' ? t('topilmadi') : t('o‘tkazildi'));

/**
 * Yozishdan oldingi moslash hisoboti (F2 import auditi, 2026-11-09): har manba qatori — manba yo'li, smeta qatori,
 * ishonch va sabab. Standart ko'rinish — faqat muammoli qatorlar (shubhali, xato, ◐, ✕).
 */
export function F2MoslashHisoboti({ hisobot }: { hisobot: MoslashHisoboti }) {
  const [hammasi, setHammasi] = useState(false);
  const { stat } = hisobot;
  const qatorlar = hammasi ? hisobot.qatorlar : hisobot.qatorlar.filter((q) => q.xato || q.shubhali || q.ishonch === 'ehtimol' || q.ishonch === 'topilmadi');
  return (
    <details className="karta p-3 text-[12px]" aria-label={t('Moslash hisoboti')} open={stat.xato > 0 || undefined}>
      <summary className="cursor-pointer font-semibold text-text">
        {t('Moslash hisoboti')}: ✓ {stat.aniq} · ◐ {stat.ehtimol} · ✕ {stat.topilmadi}
        {stat.shubhali > 0 && <span className="text-warn"> · {t('shubhali')} {stat.shubhali}</span>}
        {stat.xato > 0 && <span className="text-danger"> · {t('xato')} {stat.xato}</span>}
      </summary>
      <p className="mt-1 text-text-dim">{t('Shubhali qatorlar (bir xil shifr, lekin К=/qalinlik farqli; bir nechta manba bloki bitta qatorga; boshqa bo‘lim; birlik farqi) PTO tasdig‘isiz aktga kirmasligi kerak — har birini tekshiring.')}</p>
      <label className="mt-1 inline-flex items-center gap-1">
        <input type="checkbox" checked={hammasi} onChange={(e) => setHammasi(e.target.checked)} />
        {t('Barcha qatorlarni ko‘rsatish')}
      </label>
      <div className="mt-2 max-h-96 overflow-auto">
        <table className="w-full text-[11.5px]">
          <thead><tr className="text-text-mute">
            <th className="text-left">{t('Manzil')}</th><th className="text-left">{t('Manba yo‘li')}</th><th className="text-left">{t('Manba qatori')}</th>
            <th className="text-left">{t('Smeta qatori')}</th><th className="text-left">{t('Ishonch')}</th><th className="text-left">{t('Sabab')}</th>
          </tr></thead>
          <tbody>{qatorlar.slice(0, 500).map((q) => (
            <tr key={q.uid} data-ishonch={q.ishonch} className={`border-t border-border/40 ${q.xato ? 'text-danger' : q.shubhali ? 'text-warn' : ''}`}>
              <td className="pr-2 tabular-nums">{q.manzil}</td>
              <td className="pr-2">{q.manbaYol || '—'}</td>
              <td className="pr-2">{[q.kod, q.nom.slice(0, 70)].filter(Boolean).join(' ')} · {q.hajm ?? '—'} {q.birlik ?? ''}</td>
              <td className="pr-2">{q.smeta ? <>{q.smeta.slice(0, 70)}{q.smetaYol && <span className="block text-text-mute">{q.smetaYol}</span>}</> : '—'}</td>
              <td className="pr-2 whitespace-nowrap">{BELGI[q.ishonch]} {ishonchNomi(q.ishonch)}{q.xato ? ` · ${t('xato')}` : q.shubhali ? ` · ${t('shubhali')}` : ''}</td>
              <td>{q.sabablar.join(' · ') || '—'}</td>
            </tr>
          ))}</tbody>
        </table>
        {qatorlar.length > 500 && <p className="mt-1 text-text-mute">{t('Yana {n} ta qator', { n: qatorlar.length - 500 })}</p>}
        {!qatorlar.length && <p className="mt-1 text-text-mute">{t('Muammoli qator yo‘q.')}</p>}
      </div>
    </details>
  );
}
