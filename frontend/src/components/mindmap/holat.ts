/** Holat ranglari (Firuza tokenlari) va nomlari — xarita komponentlari uchun umumiy. */
import { t, tilOl } from '../../i18n/til';
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
  if (h === 'xavf') return t('Narxsiz qator, smeta yo‘q, ko‘zgu farqi yoki kritik signal');
  if (h === 'etibor') return t('Ochiq zayavka, resurs qatorlari yo‘q, F2 ortiqcha (overbilling) yoki ochiq signal');
  if (h === 'yaxshi') return t('Belgi va ochiq signal yo‘q');
  return t('Holat o‘qilmadi');
}

export const foizMatn = (v: number | null | undefined): string => (v == null || !Number.isFinite(v) ? '—' : new Intl.NumberFormat(tilOl() === 'en' ? 'en-GB' : 'ru-RU', { maximumFractionDigits: 1 }).format(v) + '%');


/** Qisqa pul yozuvi tanlangan tilda: «183,3 mlrd», «22,8 mln», «640 ming». Noma’lum — «—» (0 emas). */
export function pulQ(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  // O‘zbek/rus: o‘nlik vergul va bo‘shliq bilan guruhlash («183,3»); brauzerda uz locale bo‘lmasa ham bir xil.
  const loc = tilOl() === 'en' ? 'en-GB' : 'ru-RU';
  const f = (v: number, kasr = 1) => new Intl.NumberFormat(loc, { maximumFractionDigits: kasr }).format(v);
  if (a >= 1e12) return f(n / 1e12, 2) + ' ' + t('trln');
  if (a >= 1e9) return f(n / 1e9) + ' ' + t('mlrd');
  if (a >= 1e6) return f(n / 1e6) + ' ' + t('mln');
  if (a >= 1e3) return f(n / 1e3, 0) + ' ' + t('ming');
  return f(n, 0);
}
