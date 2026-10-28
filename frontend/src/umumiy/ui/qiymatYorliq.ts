import { t } from '../../i18n/til';
import type { UchlikSabab } from '../../lib/ustamali-summa';

/** «—» izohi: QQS bilan qiymat nima uchun noma’lum (0 deb ko‘rsatilmaydi). */
const SABAB: Record<UchlikSabab, () => string> = {
  SUMMA_YOQ: () => t('Manba qiymati yo‘q'),
  HISOBLANMADI: () => t('Ustamali summa hisoblanmadi'),
  KOEF_YOQ: () => t('Ustama koeffitsientlari o‘qilmadi — ustamali summa noma’lum'),
  PODVAL_TOLIQ_EMAS: () => t('Obyekt nakrutka podvali to‘liq emas — ustamali summa noma’lum'),
  KAT_NOMALUM: () => t('Qatorlarning kategoriyasi noma’lum — QQS bilan qiymat hisoblanmaydi'),
  QQS_STAVKA_YOQ: () => t('QQS stavkasi koeffitsientlarda yo‘q — QQS bilan qiymat noma’lum'),
  KESIM_YOQ: () => t('Bu manbada kategoriya kesimi yo‘q — ustamali va QQS bilan qiymat hisoblanmaydi (Nakopitelniy / Pul tahlilida bor)'),
};
export const uchlikSababMatni = (s: UchlikSabab | null | undefined): string | undefined => (s ? SABAB[s]() : undefined);


/** Summa turi yorlig‘i (egasi 2026-10-27: har summa qisqa yorliq bilan) — QQS bilan / ustamali, QQS siz / ustamasiz / narx QQS siz. */
export type SummaTuri = 'qqs' | 'ustamali' | 'ustamasiz' | 'narx';
const SUMMA_TURI: Record<SummaTuri, () => string> = {
  qqs: () => t('QQS bilan'),
  ustamali: () => t('ustamali, QQS siz'),
  ustamasiz: () => t('ustamasiz, QQS siz'),
  narx: () => t('QQS siz'),
};
export const summaTuriMatni = (tur: SummaTuri): string => SUMMA_TURI[tur]();
