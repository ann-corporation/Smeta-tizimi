/**
 * Tomon (zakazchik ↔ pudratchi …) sahifalari uchun umumiy UI komponentlari. Komponent bo'lmagan yordamchilar —
 * tomon-yordam.ts. Hamma matn t() orqali; ruxsat serverda — bu yerda faqat ko'rinish.
 */
import type { ReactNode } from 'react';
import { t } from '../../i18n/til';
import type { AktUstama, AloqaHolat, TaqdimHolat } from '../../api/t2-tomon';
import { pul } from './tomon-yordam';

const ALOQA_NOMI: Record<AloqaHolat, string> = {
  taklif: 'Taklif (javob kutilmoqda)', faol: 'Faol', toxtatilgan: 'To‘xtatilgan', yopilgan: 'Yopilgan', rad: 'Rad etilgan', bekor: 'Bekor qilingan',
};
const TAQDIM_NOMI: Record<TaqdimHolat, string> = {
  yuborilgan: 'Yuborilgan', ko_rilmoqda: 'Ko‘rib chiqilmoqda', qabul: 'Qabul qilingan', rad: 'Rad etilgan', tuzatish: 'Tuzatish so‘ralgan', qaytarilgan: 'Qaytarib olingan',
};
const RANG: Record<string, string> = {
  faol: 'bg-ok/15 text-ok', qabul: 'bg-ok/15 text-ok',
  taklif: 'bg-warn/15 text-warn', yuborilgan: 'bg-warn/15 text-warn', ko_rilmoqda: 'bg-accent/15 text-accent', tuzatish: 'bg-warn/15 text-warn', toxtatilgan: 'bg-warn/15 text-warn',
  rad: 'bg-danger/15 text-danger', yopilgan: 'bg-surface-2 text-text-dim', bekor: 'bg-surface-2 text-text-dim', qaytarilgan: 'bg-surface-2 text-text-dim',
};

export function HolatBelgi({ holat, turi }: { holat: string; turi: 'aloqa' | 'taqdim' }) {
  const nom = turi === 'aloqa' ? ALOQA_NOMI[holat as AloqaHolat] : TAQDIM_NOMI[holat as TaqdimHolat];
  return <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${RANG[holat] ?? 'bg-surface-2 text-text-dim'}`}>{nom ? t(nom) : holat}</span>;
}

export function Bolim({ sarlavha, children, amal }: { sarlavha: string; children: ReactNode; amal?: ReactNode }) {
  return (
    <section className="rounded-lg border border-border">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <h2 className="text-sm font-semibold">{t(sarlavha)}</h2>{amal}
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}

/** Rasmiy hujjat (rus) podval satrlari - tartib va nomlar F2 qog'ozidagidek. */
const PODVAL_NOMI: Array<[keyof AktUstama['podval'], string]> = [
  ['tr_mat', 'Транспортные расходы (материалы)'], ['skl_mat', 'Заготовительно-складские расходы (материалы)'], ['tr_kab', 'Транспортные расходы (кабель)'],
  ['itogo1', 'ИТОГО 1'], ['prochie', 'Прочие затраты подрядчика'], ['itogo2', 'ИТОГО 2'], ['tr_ob', 'Транспортные расходы (оборудование)'],
  ['zag_ob', 'Заготовительно-складские расходы (оборудование)'], ['itogo3', 'ИТОГО 3'], ['strax', 'Страхование'], ['risk', 'Риск'],
  ['itogo4', 'ИТОГО (без НДС)'], ['nds', 'НДС'], ['vsego', 'ВСЕГО (с НДС)'],
];

/** Egasi qoidasi: USTAMALI asosiy (katta), ustamasiz yonida kichik, NDS siz. Kategoriyasiz qism taxminiy deb aytiladi. */
export function TomonSummaJuft({ u, kichik = false }: { u: Pick<AktUstama, 'pryamye' | 'ustamali' | 'katsiz' | 'narxsiz_qator'>; kichik?: boolean }) {
  return (
    <span className="inline-flex flex-col leading-tight tabular-nums" data-testid="tomon-summa-juft">
      <b className={kichik ? 'text-[12px]' : 'text-[14px]'} data-testid="tomon-ustamali">{u.katsiz > 0 ? '≈ ' : ''}{pul(u.ustamali)}</b>
      <span className="text-[10.5px] text-text-dim" data-testid="tomon-ustamasiz">{t('ustamasiz')}: {pul(u.pryamye)}</span>
      {u.katsiz > 0 && <span className="text-[10px] text-warn">{t('taxminiy (kat noma’lum: {pul} so‘m)', { pul: pul(u.katsiz) })}</span>}
      {u.narxsiz_qator > 0 && <span className="text-[10px] text-warn">{t('narxsiz qator: {n} ta', { n: u.narxsiz_qator })}</span>}
    </span>
  );
}

/** Hujjatdagi podval satrlari (faqat summalar; 0 va bo'sh satrlar yashirin). */
export function PodvalJadvali({ podval }: { podval: AktUstama['podval'] }) {
  const qatorlar = PODVAL_NOMI.filter(([k]) => podval[k] != null && Number(podval[k]) !== 0);
  if (qatorlar.length === 0) return null;
  return (
    <table className="w-full max-w-xl text-xs"><tbody>{qatorlar.map(([k, nom]) => (
      <tr key={k} className={`border-t ${k === 'itogo4' || k === 'vsego' ? 'font-semibold' : ''}`}><td className="px-2 py-0.5">{nom}</td><td className="px-2 py-0.5 text-right tabular-nums">{pul(podval[k])}</td></tr>))}</tbody></table>
  );
}
