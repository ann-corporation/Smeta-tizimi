import { t } from '../../i18n/til';
import { portfelUchligi } from '../../lib/ustamali-summa';
import { QiymatUchlik } from './QiymatUchlik';
import { usePortfelUstamali, type PortfelObyekt } from './usePortfelUstamali';

/**
 * Bir nechta obyekt (loyiha, shartnoma, portfel) JAMI qiymati — egasi qoidasi 2026-10-27: QQS BILAN asosiy (katta),
 * ostida ustamali (QQS siz) va to‘g‘ri xarajat (ustamasiz). Yagona `QiymatUchlik` ko‘rinishi; hisob `portfelUchligi`.
 * `ustamasiz` — sahifadagi mavjud manba summasi (masalan smeta jami); berilmasa server kesimidan olinadi.
 * Ustamasi hisoblanmagan obyekt bo‘lsa — «≈» va nechtasi kirmagani aniq yoziladi (0 deb olinmaydi).
 */
export function PortfelSummaJuft({ obyektlar, ustamasiz, kompaniyaId, kichik = false, className = '', yorliq }: {
  obyektlar: readonly PortfelObyekt[]; ustamasiz?: number | null; kompaniyaId?: number | null; kichik?: boolean; className?: string; yorliq?: string;
}) {
  const p = usePortfelUstamali(obyektlar, { kompaniyaId });
  const asos = ustamasiz !== undefined ? ustamasiz : p.ustamasiz;
  const q = portfelUchligi(p, asos);
  const qisman = q.taxminiy;
  return (
    <span className="contents" data-testid="portfel-summa-juft">
      <QiymatUchlik q={q} kichik={kichik} className={className} yorliq={yorliq} yuklanmoqda={p.holat === 'yuklanmoqda'}
        title={qisman ? t('{n} ta obyektning ustamasi va QQS hisoblanmadi — ular to‘g‘ri xarajati bilan qo‘shilgan', { n: p.nomalumSoni }) : undefined}>
        {qisman && <span className="text-[10px] text-warn">{t('{n} / {jami} obyekt ustamasi noma’lum', { n: p.nomalumSoni, jami: p.jamiSoni })}</span>}
        {p.holat !== 'yuklanmoqda' && p.ustamali == null && p.jamiSoni > 0 && <button type="button" className="text-left text-[10px] text-warn underline" onClick={p.retry}>{t('Ustama o‘qilmadi — qayta urinish')}</button>}
      </QiymatUchlik>
    </span>
  );
}
