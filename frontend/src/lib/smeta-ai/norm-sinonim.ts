/**
 * Estimator wording -> normative wording: abbreviations («ж/б», «уст-во», «толщ.»), everyday words («рытье» = «разработка»)
 * and the table learned from approved smetas (norm-sinonim-oqilgan.ts, fitted on the TUNING half only).
 * Used ONLY to add searchable words to a query; it never changes what the user wrote.
 */
import { ildiz, sozlar } from './matn-qidiruv';
import { SINONIM_OQILGAN } from './norm-sinonim-oqilgan';

const QISQARTMA: Array<[RegExp, string]> = [
  [/(?:^|[^а-яa-z])ж\s?\/?\.?\s?б(?:ет\w*)?(?![а-яa-z])/gi, ' железобетонный '],
  [/(?:^|[^а-яa-z])м\s?\/\s?к(?![а-яa-z])/gi, ' металлоконструкции '],
  [/уст-?во|устр-?во/gi, ' устройство '],
  [/толщ\.?(?![а-я])/gi, ' толщина толщиной '],
  [/(?:^|[^а-яa-z])гр\.?(?=\s*\d|[\s,]|$)/gi, ' группа '],
  [/экс\.?(?=[\s.,]|$)|экск\./gi, ' экскаватор '],
  [/[её]мк\.?(?=[\s.,]|$)/gi, ' вместимость '],
  [/диам\.?(?![а-я])/gi, ' диаметр '],
  [/(?:^|[^а-яa-z])пп(?![а-яa-z])/gi, ' плита перекрытия '],
  [/(?:^|[^а-яa-z])к-?т(?![а-яa-z])/gi, ' комплект '],
  [/(?:^|[^а-яa-z])б\/у(?![а-яa-z])/gi, ' бывший '],
  [/(?:^|[^а-яa-z])ст\.(?=\s)/gi, ' сталь стальной '],
];

/** Everyday / estimator words -> normative words (stem keys, 6 letters like matn-qidiruv). */
const QOLDA: Record<string, string> = {
  рытье: 'разработка', рытьё: 'разработка', копка: 'разработка', выемка: 'разработка', котлов: 'разработка грунта', перекид: 'перемещение',
  забивк: 'засыпка', присып: 'засыпка', обратн: 'засыпка', навеск: 'установка', подвес: 'установка', монтаж: 'установка', укладк: 'прокладка устройство',
  подготов: 'основание устройство', подстил: 'основание слой', обмазо: 'нанесение изоляция', окраск: 'окраска покраска', покраск: 'окраска',
  оштукат: 'штукатурка', кладка: 'кладка', ограждение: 'ограждение', огражд: 'ограждение перила', перила: 'ограждение', кровел: 'покрытие кровля',
  утепл: 'теплоизоляция', утепли: 'теплоизоляция', гидроиз: 'гидроизоляция', облиц: 'облицовка', стяжк: 'стяжка устройство', демонтаж: 'разборка',
  разбор: 'демонтаж', вывоз: 'перевозка', погруз: 'погрузка', трамб: 'уплотнение', утрам: 'уплотнение', планир: 'планировка', засып: 'засыпка',
  водопровод: 'трубопровод', канализ: 'трубопровод канализация', отоплен: 'трубопровод отопление', полиэтилен: 'пластмассовый', полипроп: 'пластмассовый',
};
const stemOf = (w: string) => ildiz(w);

/** Abbreviations expanded in place (the original words stay: «ж/б» -> «ж/б железобетонный»). */
export function qisqartmaOch(matn: string): string {
  let t = matn;
  for (const [re, to] of QISQARTMA) t = t.replace(re, m => `${m}${to}`);
  return t;
}

/** Extra normative words for the line: hand table + learned table, by word stem; '' when nothing applies. */
export function sinonimlar(matn: string, ort: Record<string, string> = SINONIM_OQILGAN): string {
  const out = new Set<string>();
  for (const w of sozlar(matn)) {
    const st = stemOf(w);
    if (!st) continue;
    const a = QOLDA[w] ?? QOLDA[st] ?? QOLDA[w.slice(0, 6)];
    if (a) for (const x of a.split(' ')) out.add(x);
    const b = ort[st];
    if (b) for (const x of b.split(' ')) out.add(x);
  }
  return [...out].join(' ');
}
