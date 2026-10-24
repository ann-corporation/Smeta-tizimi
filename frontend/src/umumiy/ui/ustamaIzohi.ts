import { t } from '../../i18n/til';
import type { UstamaNatija, ZanjirKod } from '../../lib/ustamali-summa';

export const pulMatni = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(n);

const ZANJIR_NOMI: Record<ZanjirKod, () => string> = {
  pryamye: () => t('To‘g‘ridan-to‘g‘ri xarajat'),
  transport: () => t('Transport va ombor (ZSR)'),
  prochie: () => t('Pudratchining boshqa xarajatlari'),
  sugurta: () => t('Sug‘urta va risk'),
  itogo: () => t('Ustamali jami (QQS siz)'),
};

/** Sichqoncha ustidagi izoh: to‘g‘ridan-to‘g‘ri → transport/ZSR → prochie → sug‘urta → itogo (+ QQS alohida). */
export function ustamaIzohi(u: UstamaNatija | null, ustamasiz: number | null | undefined): string {
  if (!u) return t('Ustamali summa hisoblanmadi');
  if (u.xato === 'KOEF_YOQ') return t('Ustama koeffitsientlari o‘qilmadi — ustamali summa noma’lum');
  if (u.xato === 'PODVAL_TOLIQ_EMAS') return t('Obyekt nakrutka podvali to‘liq emas — ustamali summa noma’lum');
  const out = u.zanjir.map((z) => `${ZANJIR_NOMI[z.kod]()}${z.foiz ? ` ${z.foiz}%` : ''}: ${pulMatni(z.summa)}`);
  if (u.ndsBilan != null) out.push(`${t('QQS bilan (alohida)')}: ${pulMatni(u.ndsBilan)}`);
  if (u.nomalum.soni > 0 || u.nomalum.summa !== 0) out.push(t('Kat noma’lum {pul} so‘m ({n} qator) ustamaga kirmagan', { pul: pulMatni(u.nomalum.summa), n: u.nomalum.soni }));
  if (ustamasiz != null && Math.abs(ustamasiz - (u.ustamasiz + u.nomalum.summa)) > 0.5) out.push(t('Diqqat: berilgan ustamasiz summa kesim yig‘indisidan farq qiladi'));
  return out.join('\n');
}
