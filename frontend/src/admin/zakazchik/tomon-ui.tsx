/**
 * Tomon (zakazchik ↔ pudratchi …) sahifalari uchun umumiy UI komponentlari. Komponent bo'lmagan yordamchilar —
 * tomon-yordam.ts. Hamma matn t() orqali; ruxsat serverda — bu yerda faqat ko'rinish.
 */
import type { ReactNode } from 'react';
import { t } from '../../i18n/til';
import type { AktUstama, AloqaHolat, TaqdimHolat } from '../../api/t2-tomon';
import { pul, TAQDIM_HOLAT_NOMI } from './tomon-yordam';
import { serverUchligi } from '../../lib/ustamali-summa';
import { QiymatUchlik } from '../../umumiy/ui/QiymatUchlik';

const ALOQA_NOMI: Record<AloqaHolat, string> = {
  taklif: 'Taklif (javob kutilmoqda)', faol: 'Faol', toxtatilgan: 'To‘xtatilgan', yopilgan: 'Yopilgan', rad: 'Rad etilgan', bekor: 'Bekor qilingan',
};
const TAQDIM_NOMI: Record<TaqdimHolat, string> = TAQDIM_HOLAT_NOMI;
/** Holat → Firuza muhri (so'z + rang): yashil — qabul/faol, sariq — kutilmoqda, ko'k — ko'rib chiqilmoqda, qizil — rad. */
const RANG: Record<string, string> = {
  faol: 'fz-stamp--ok', qabul: 'fz-stamp--ok',
  taklif: 'fz-stamp--warn', yuborilgan: 'fz-stamp--warn', ko_rilmoqda: 'fz-stamp--info', tuzatish: 'fz-stamp--warn', toxtatilgan: 'fz-stamp--warn',
  rad: 'fz-stamp--danger', yopilgan: 'fz-stamp--draft', bekor: 'fz-stamp--draft', qaytarilgan: 'fz-stamp--draft',
};

export function HolatBelgi({ holat, turi }: { holat: string; turi: 'aloqa' | 'taqdim' }) {
  const nom = turi === 'aloqa' ? ALOQA_NOMI[holat as AloqaHolat] : TAQDIM_NOMI[holat as TaqdimHolat];
  return <span className={`fz-stamp ${RANG[holat] ?? ''}`}>{nom ? t(nom) : holat}</span>;
}

export function Bolim({ sarlavha, children, amal }: { sarlavha: string; children: ReactNode; amal?: ReactNode }) {
  return (
    <section className="fz-card">
      <header className="fz-card__head flex-wrap">
        <h2 className="fz-card__title">{t(sarlavha)}</h2>{amal}
      </header>
      <div className="p-4">{children}</div>
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

/**
 * Egasi qoidasi (2026-10-27): QQS BILAN asosiy (katta; server podvali `vsego`), ostida ustamali (QQS siz) va to‘g‘ri xarajat —
 * yagona `QiymatUchlik`. Kategoriyasiz qism taxminiy deb aytiladi («≈» ikkala ustamali qiymatda ham).
 */
export function TomonSummaJuft({ u, kichik = false }: { u: Pick<AktUstama, 'pryamye' | 'ustamali' | 'katsiz' | 'narxsiz_qator'> & { podval?: AktUstama['podval'] }; kichik?: boolean }) {
  const q = { ...serverUchligi({ itogo4: u.ustamali, vsego: u.podval?.vsego ?? null }, u.pryamye), taxminiy: u.katsiz > 0, nomalum: u.katsiz };
  return (
    <span className="contents" data-testid="tomon-summa-juft">
      <QiymatUchlik q={q} kichik={kichik}>
        {u.katsiz > 0 && <span className="text-[10px] text-warn">{t('taxminiy (kat noma’lum: {pul} so‘m)', { pul: pul(u.katsiz) })}</span>}
        {u.narxsiz_qator > 0 && <span className="text-[10px] text-warn">{t('narxsiz qator: {n} ta', { n: u.narxsiz_qator })}</span>}
      </QiymatUchlik>
    </span>
  );
}

/** Hujjatdagi podval satrlari (faqat summalar; 0 va bo'sh satrlar yashirin). */
export function PodvalJadvali({ podval }: { podval: AktUstama['podval'] }) {
  const qatorlar = PODVAL_NOMI.filter(([k]) => podval[k] != null && Number(podval[k]) !== 0);
  if (qatorlar.length === 0) return null;
  return (
    <div className="fz-table-wrap max-w-xl"><table className="fz-table"><tbody>{qatorlar.map(([k, nom]) => (
      <tr key={k} className={k === 'itogo4' || k === 'vsego' ? 'fz-row-total' : ''}><td>{nom}</td><td className="fz-c-num">{pul(podval[k])}</td></tr>))}</tbody></table></div>
  );
}
