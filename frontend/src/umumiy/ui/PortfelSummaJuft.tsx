import { FmtN } from '../../lib/format';
import { t } from '../../i18n/til';
import { usePortfelUstamali, type PortfelObyekt } from './usePortfelUstamali';

/**
 * Bir nechta obyekt yig‘indisi uchun pul JUFTI: USTAMALI (asosiy, katta) + ustamasiz (kichik).
 * `ustamasiz` — sahifadagi mavjud manba summasi (masalan smeta jami); berilmasa server kesimidan olinadi.
 * Ustamali hisoblanmagan obyekt bo‘lsa — «≈» va nechtasi kirmagani aniq yoziladi (0 deb olinmaydi).
 */
export function PortfelSummaJuft({ obyektlar, ustamasiz, kompaniyaId, kichik = false, className = '' }: {
  obyektlar: readonly PortfelObyekt[]; ustamasiz?: number | null; kompaniyaId?: number | null; kichik?: boolean; className?: string;
}) {
  const p = usePortfelUstamali(obyektlar, { kompaniyaId });
  const asos = ustamasiz !== undefined ? ustamasiz : p.ustamasiz;
  const katta = kichik ? 'text-[12px]' : 'text-[15px]';
  const bilinmaydi = asos == null || !Number.isFinite(asos);
  const qisman = p.ustamali != null && p.nomalumSoni > 0;
  // Qisman: ustamasi noma'lum obyektlar ustamasiz qiymati bilan qo'shiladi (ustama o'ylab topilmaydi, pul tushib qolmaydi).
  const korinadi = p.ustamali == null ? null : qisman && !bilinmaydi ? p.ustamali + Math.max(0, asos! - p.hisoblanganUstamasiz) : p.ustamali;
  return (
    <span className={`inline-flex flex-col leading-tight tabular-nums ${className}`} data-testid="portfel-summa-juft"
      title={qisman ? t('{n} ta obyektning ustamasi hisoblanmadi — ular ustamasiz qiymati bilan qo‘shilgan', { n: p.nomalumSoni }) : undefined}>
      <span className={katta} data-testid="summa-ustamali">
        {p.holat === 'yuklanmoqda' ? <span className="text-text-mute">{t('Hisoblanmoqda…')}</span>
          : p.ustamali != null ? <b className="text-text">{qisman ? '≈ ' : ''}<FmtN val={korinadi} /></b>
            : p.jamiSoni === 0 ? <span className="text-text-mute">—</span>
              : <button type="button" className="text-warn underline" onClick={p.retry}>{t('ustamali noma’lum')}</button>}
      </span>
      {!bilinmaydi && <span className="text-[10.5px] text-text-mute" data-testid="summa-ustamasiz">{t('ustamasiz')}: <FmtN val={asos} /></span>}
      {qisman && <span className="text-[10px] text-warn">{t('{n} / {jami} obyekt ustamasi noma’lum', { n: p.nomalumSoni, jami: p.jamiSoni })}</span>}
    </span>
  );
}
