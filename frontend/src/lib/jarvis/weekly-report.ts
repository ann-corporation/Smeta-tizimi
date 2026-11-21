import type { AgentJavob, RivojlanishNatija } from '../../api/t2-agent-ish';
import { t } from '../../i18n/til';
export function weeklyReportNotice(response: AgentJavob<RivojlanishNatija>) {
  if (!response.ok) {
    const receipt = response.jarvis_hafta;
    if (receipt?.ok && receipt.taklif_id) return { message: t('Haftalik hisobot mavjud, lekin umumiy tahlil tugamadi'),
      tone: 'warn' as const, open: receipt.yaratildi === true, refresh: true };
    return { message: response.error, tone: 'danger' as const, open: false, refresh: false };
  }
  const result = response.natija;
  const week = result.jarvis_hafta;
  const open = result.takliflar.length > 0 || (week?.ok === true && week.yaratildi === true);
  const tone: 'ok' | 'warn' = week?.ok === false ? 'warn' : 'ok';
  const message = week?.ok === false ? t('Haftalik Jarvis hisobotini hozir tayyorlab bo‘lmadi')
    : week?.yaratildi ? t('Haftalik Jarvis hisoboti ko‘rib chiqish uchun tayyorlandi')
    : week?.taklif_id ? t('Haftalik Jarvis hisoboti avval tayyorlangan')
    : week?.sabab === 'NO_ELIGIBLE_FAILURES' ? t('Haftalik hisobot uchun yetarli anonim signal yo‘q')
    : result.xabar || `${t('Yangi takliflar')}: ${result.takliflar.length}`;
  return { message, tone, open, refresh: true };
}
