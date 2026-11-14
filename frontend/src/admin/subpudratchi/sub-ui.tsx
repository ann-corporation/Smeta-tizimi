/** Subpudratchi sahifalari uchun umumiy kichik komponentlar (Bugun va Boshqaruv). Pul hisobi yo'q - faqat ko'rsatish. */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { t } from '../../i18n/til';
import type { SubAktHolat } from '../../api/t2-sub';
import { SUB_AKT_HOLAT_NOMI } from '../../lib/subpudratchi/hisob';

/** Pul ko'rsatish: noma'lum = «—» (0 emas). Hisob lib/hisob-yadro da. */
export const pulKorsat = (v: number | null | undefined): string => (v == null ? '—' : v.toLocaleString('ru-RU', { maximumFractionDigits: 2 }));
export const hajmKorsat = (v: number | null | undefined): string => (v == null ? '—' : v.toLocaleString('ru-RU', { maximumFractionDigits: 3 }));
export const oyKorsat = (v: string | null | undefined): string => (v ? v.slice(0, 7) : '—');

const RANG: Record<SubAktHolat, string> = { qoralama: 'fz-stamp--draft', yuborilgan: 'fz-stamp--warn', qabul: 'fz-stamp--ok', tuzatish: 'fz-stamp--warn', bekor: 'fz-stamp--draft' };
export function AktHolatBelgi({ holat }: { holat: SubAktHolat }) {
  return <span className={`fz-stamp ${RANG[holat]}`}>{t(SUB_AKT_HOLAT_NOMI[holat])}</span>;
}

/** Katta tugma-katak (PlayStation pult): raqam + bitta amal. */
export function Katak({ ikon, nom, son, izoh, tugma, yol, rang }: { ikon: ReactNode; nom: string; son: number | null; izoh: string; tugma: string; yol: string; rang?: 'warn' | 'ok' }) {
  const ichki = yol.startsWith('#');
  return (
    <section className="fz-panel flex flex-col gap-2" aria-label={nom}>
      <div className="flex items-center gap-2 text-[13px] text-text-mute">{ikon}<span>{nom}</span></div>
      <div className={`text-[30px] font-semibold tabular-nums leading-none ${rang === 'warn' ? 'text-warn' : rang === 'ok' ? 'text-ok' : ''}`}>{son ?? '—'}</div>
      <p className="text-[12.5px] text-text-mute">{izoh}</p>
      {ichki
        ? <a href={yol} className="fz-btn fz-btn--primary mt-auto w-full text-center">{tugma}</a>
        : <Link to={yol} className="fz-btn fz-btn--primary mt-auto w-full text-center">{tugma}</Link>}
    </section>
  );
}
