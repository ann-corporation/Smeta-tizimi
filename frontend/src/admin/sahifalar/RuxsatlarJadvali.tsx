import { useMemo } from 'react';
import { ruxsatMatritsa } from '../../lib/nav/ruxsatMatritsa';
import { ROLE_LABELS } from '../../lib/company-authorization/permission-labels';
import { t } from '../../i18n/til';

/**
 * RUXSATLAR JADVALI (ekotizim V2, 2-qadam) — faqat o'qish. Yagona sahifa reestridan hosila: qaysi rol qaysi sahifani menyuda ko'radi.
 * Hech narsa o'zgartirilmaydi; ruxsat manbai — reestrdagi `Sahifa.ruxsat` (lib/reestr/sahifa.ts).
 */
export default function RuxsatlarJadvali() {
  const { rollar, qatorlar } = useMemo(() => ruxsatMatritsa(), []);
  let oxirgiJoy = '';
  return (
    <div className="p-4 sm:p-6" data-testid="ruxsatlar-jadvali">
      <h1 className="text-[20px] font-semibold text-text">{t('Ruxsatlar jadvali')}</h1>
      <p className="mt-1 max-w-3xl text-sm text-text-dim">{t('Kim qaysi sahifani ko‘radi: rol bo‘yicha. Jadval yagona sahifa reestridan avtomatik quriladi; bu yerda hech narsa o‘zgartirilmaydi.')}</p>
      <div className="mt-4 overflow-auto rounded-md border border-border" style={{ maxHeight: '70vh' }}>
        <table className="min-w-full border-collapse text-[12px]">
          <thead className="sticky top-0 z-10 bg-surface">
            <tr>
              <th className="sticky left-0 bg-surface px-3 py-2 text-left font-semibold">{t('Sahifa')}</th>
              {rollar.map((r) => <th key={r} className="px-2 py-2 font-medium text-text-dim" title={r}>{ROLE_LABELS[r] ?? r}</th>)}
            </tr>
          </thead>
          <tbody>
            {qatorlar.flatMap((q) => {
              const sarlavha = q.ishJoyi !== oxirgiJoy;
              oxirgiJoy = q.ishJoyi;
              return [
                sarlavha && <tr key={`h-${q.ishJoyi}`}><td colSpan={rollar.length + 1} className="bg-surface-3 px-3 py-1 text-[11px] font-semibold uppercase tracking-[.06em] text-text-mute">{t(q.ishJoyiNom)}</td></tr>,
                <tr key={q.kalit} className="border-t border-border">
                  <td className="sticky left-0 bg-bg px-3 py-1.5" title={q.ruxsat.join(' | ') || t('hamma kirgan')}>{t(q.nom)}</td>
                  {rollar.map((r) => <td key={r} className={`px-2 py-1.5 text-center ${q.korinadi[r] ? 'text-accent' : 'text-text-mute'}`} aria-label={q.korinadi[r] ? t('ko‘radi') : t('ko‘rmaydi')}>{q.korinadi[r] ? '●' : '·'}</td>)}
                </tr>,
              ];
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}