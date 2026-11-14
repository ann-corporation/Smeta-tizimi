import { t } from '../../i18n/til';
import { FmtN } from '../../lib/format';
import type { HrKpiXulosa } from '../../api/t2-hr';
import { KPI_MANBA, KPI_NOMI, kpiQiymatMatn } from '../../lib/hr/qarorlar';

/**
 * KPI ko'rsatkichlari (D2): har biri qiymati, og'irligi va «qayerdan olindi» bilan. Qiymat noma'lum bo'lsa «—» (0 emas).
 * KPI faqat ko'rsatiladi: pulga ta'siri sozlamada (D3).
 */
export function HrKpiBlok({ kpi, pulgaTasir }: { kpi: HrKpiXulosa | null | undefined; pulgaTasir?: boolean }) {
  if (!kpi || kpi.korsatkichlar.length === 0) return <p className="text-[12px] text-text-mute">{t('Bu rol uchun KPI ko‘rsatkichi belgilanmagan.')}</p>;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-3">
        <span className="text-[12px] text-text-mute">{t('KPI bali')}</span>
        <span className="text-[22px] font-semibold tabular-nums" data-testid="kpi-ball">{kpi.ball == null ? '—' : `${kpi.ball}`}</span>
        <span className="text-[12px] text-text-mute">{kpi.ball == null ? t('Ball hisoblash uchun ma’lumot yoki maqsad yetarli emas.') : t('Ma’lumoti bor ko‘rsatkichlar ulushi: {n}%', { n: kpi.qamrov })}</span>
      </div>
      <div className="fz-table-wrap">
        <table className="fz-table">
          <thead><tr><th>{t('Ko‘rsatkich')}</th><th className="fz-c-num">{t('Qiymat')}</th><th className="fz-c-num">{t('Maqsad')}</th><th className="fz-c-num">{t('Og‘irlik, %')}</th><th className="fz-c-num">{t('Ball')}</th></tr></thead>
          <tbody>
            {kpi.korsatkichlar.map((k) => (
              <tr key={k.kod}>
                <td><div className="font-medium text-text">{t(KPI_NOMI[k.kod])}</div><div className="text-[11.5px] text-text-mute">{t(KPI_MANBA[k.kod])}</div></td>
                <td className="fz-c-num">{k.qiymat == null ? '—' : k.birlik === 'som' ? <FmtN val={k.qiymat} /> : kpiQiymatMatn(k, String)}</td>
                <td className="fz-c-num">{k.maqsad == null ? '—' : k.birlik === '%' ? `${k.maqsad}%` : k.maqsad}</td>
                <td className="fz-c-num">{k.ogirlik}</td>
                <td className="fz-c-num">{k.ball == null ? '—' : k.ball}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[12px] text-text-mute">{pulgaTasir ? t('KPI ish haqiga ta’sir qiladi (F2 foizli bonus).') : t('KPI hozircha faqat ko‘rsatiladi: ish haqiga ta’sir qilmaydi.')}</p>
    </div>
  );
}
