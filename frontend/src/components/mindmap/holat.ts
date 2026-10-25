/** Holat ranglari (Firuza tokenlari) va nomlari — xarita komponentlari uchun umumiy. */
import { t, raqamFormatla } from '../../i18n/til';
import type { XHolat } from '../../lib/mindmap-korinish';

export const HOLAT_RANG: Record<XHolat, string> = {
  xavf: 'var(--danger)',
  etibor: 'var(--warn)',
  yaxshi: 'var(--ok)',
  nomalum: 'var(--border-strong)',
};

export function holatNomi(h: XHolat): string {
  if (h === 'xavf') return t('Xavf');
  if (h === 'etibor') return t('E’tibor kerak');
  if (h === 'yaxshi') return t('Muammosiz');
  return t('Ma’lumot yo‘q');
}

export function holatIzohi(h: XHolat): string {
  if (h === 'xavf') return t('Narxsiz qator, smeta yo‘q yoki ko‘zgu farqi');
  if (h === 'etibor') return t('Ochiq zayavka yoki smetadan oshish');
  if (h === 'yaxshi') return t('Belgi yo‘q');
  return t('Holat o‘qilmadi');
}

export const foizMatn = (v: number | null | undefined): string => (v == null ? '—' : raqamFormatla(v, { maximumFractionDigits: 1 }) + '%');

