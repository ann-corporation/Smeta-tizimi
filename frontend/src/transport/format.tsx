import { t } from '../i18n/til';
import { qqsBilanOl } from '../lib/transport/narxlash';

/** Pul: noma'lum (null) — «kiritilmagan», 0 emas. */
export function som(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return t('kiritilmagan');
  return Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' ');
}
export function son(n: number | null | undefined, d = 1): string {
  if (n == null || !Number.isFinite(n)) return t('kiritilmagan');
  return n.toLocaleString('ru-RU', { maximumFractionDigits: d }).replace(/ /g, ' ');
}
export const foiz = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? t('kiritilmagan') : `${son(n, 1)}%`);

/** Tashqi narx: asosiy — QQS bilan (katta), QQS siz alohida (kichik). */
export function NarxQqs({ qqsSiz, qqsFoiz = 12 }: { qqsSiz: number | null | undefined; qqsFoiz?: number }) {
  if (qqsSiz == null) return <span className="text-text-mute">{t('kiritilmagan')}</span>;
  return (
    <span className="inline-flex flex-col leading-tight">
      <b className="num text-[14px]">{som(qqsBilanOl(qqsSiz, qqsFoiz))} <small className="font-normal text-text-mute">{t('so‘m, QQS bilan')}</small></b>
      <span className="num text-[11px] text-text-mute">{som(qqsSiz)} {t('QQS siz')}</span>
    </span>
  );
}

/** Ichki tannarx (QQS siz) — to'liq bo'lmasa «kamida». */
export function Tannarx({ jami, toliq }: { jami: number | null | undefined; toliq: boolean }) {
  if (jami == null) return <span className="text-text-mute">{t('kiritilmagan')}</span>;
  return <span className="num"><b>{toliq ? '' : `${t('kamida')} `}{som(jami)}</b> <small className="text-text-mute">{t('so‘m, QQS siz')}</small></span>;
}

export const bugunISO = () => new Date().toISOString().slice(0, 10);
export const oyBoshiISO = () => `${bugunISO().slice(0, 8)}01`;
export const raqamYoki = (v: string): number | null => {
  const s = v.trim().replace(/\s/g, '').replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** Kiritma uslubi (OpsMaydon ichida o'lcham beradi). */
export const INP = 'rounded-lg border border-border bg-bg text-text outline-none focus:border-accent';
