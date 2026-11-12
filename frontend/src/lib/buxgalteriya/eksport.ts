/**
 * Akt-sverka (взаимных расчётов) Excel — RUS, hujjat-yozuvchi `RasmiyVaraq` (H1–H9). Bitta kontragent, davr ichida hujjatlar bo'yicha:
 * № | Дата | Документ | Договор | Счёт | Дебет | Кредит | Сальдо (yurma, formula) | «По данным контрагента» Дебет/Кредit (bo'sh — kontragent to'ldiradi).
 * Saldo = Дебет − Кредит: «+» — контрагент должен нам, «−» — мы должны контрагенту. Summalar QQS bilan. Rang yo'q, jami qalin, imzo bloki.
 */
import { RasmiyVaraq, bugunSana, hujjatFaylNomi, imzoTomonlari, rasmiyKitob, ustunHarfi, type Qiymat } from '../hujjat-yozuvchi';
import { yaxlit2, yigindi2 } from '../hisob-yadro';
import { sverkaQatorlari, saldoTomoni } from './hisob';
import type { BuxHisobot, BuxHujjatQator, BuxOsv, BuxSverka, KassaKitob } from '../../api/t2-bux-hisob';

export type SverkaKirish = {
  kompaniya: string | null;
  kontragent: string;
  kontragentInn?: string | null;
  dan: string;
  gacha: string;
  /** Davr boshidagi saldo (Dt − Kt) shu kontragent bo'yicha (analitik hisoblar yig'indisi). */
  ochilish: number;
  hujjatlar: ReadonlyArray<BuxHujjatQator>;
};

const ddmmyyyy = (s: string) => (/^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10).split('-').reverse().join('.') : s);

export function aktSverkaHujjat(k: SverkaKirish): { bytes: Uint8Array; faylNomi: string } {
  const v = new RasmiyVaraq({
    nom: 'Акт сверки',
    kattaHarf: false,
    sarlavha: 'АКТ СВЕРКИ ВЗАИМНЫХ РАСЧЁТОВ',
    ostSarlavha: [
      `за период с ${ddmmyyyy(k.dan)} по ${ddmmyyyy(k.gacha)}`,
      'Сальдо: «+» — контрагент должен нам; «−» — мы должны контрагенту. Суммы с НДС.',
    ],
    titul: [
      ['Организация:', k.kompaniya ?? null],
      ['Контрагент:', k.kontragent],
      ['ИНН контрагента:', k.kontragentInn ?? null],
      ['Дата составления:', ddmmyyyy(bugunSana())],
    ],
    ustunlar: [
      { sarlavha: '№ п/п', kenglik: 6, tur: 'tartib' },
      { sarlavha: 'Дата', kenglik: 12, tur: 'kod' },
      { sarlavha: 'Документ-основание', kenglik: 34, tur: 'matn' },
      { sarlavha: 'Договор', kenglik: 14, tur: 'kod' },
      { sarlavha: 'Счёт', kenglik: 8, tur: 'kod' },
      { sarlavha: 'Дебет', kenglik: 16, tur: 'pul', guruh: 'По данным организации' },
      { sarlavha: 'Кредит', kenglik: 16, tur: 'pul', guruh: 'По данным организации' },
      { sarlavha: 'Сальдо', kenglik: 16, tur: 'pul', guruh: 'По данным организации' },
      { sarlavha: 'Дебет', kenglik: 16, tur: 'pul', guruh: 'По данным контрагента' },
      { sarlavha: 'Кредит', kenglik: 16, tur: 'pul', guruh: 'По данным контрагента' },
    ],
    yonalish: 'landscape',
  });
  const s = sverkaQatorlari(k.ochilish, k.hujjatlar);
  const H = ustunHarfi; // 0-asosli ustun indeksi → harf
  const F = H(5); const G = H(6); const S = H(7);

  const och = v.qator('oddiy', () => [null, ddmmyyyy(k.dan), 'Сальдо на начало периода', null, null, null, null, yaxlit2(k.ochilish), null, null]);
  const bosh = v.r;
  s.qatorlar.forEach((h, i) => {
    v.qator('ish', (rr) => [
      i + 1, ddmmyyyy(h.sana), h.hujjat ? `${h.hujjat}` : (h.izoh ?? 'Проводка'), h.shartnoma_raqam ?? null, h.hisob,
      h.dt === 0 ? null : yaxlit2(h.dt), h.kt === 0 ? null : yaxlit2(h.kt),
      { f: `${S}${rr - 1}+N(${F}${rr})-N(${G}${rr})`, v: h.saldo }, null, null,
    ] as Qiymat[]);
  });
  const oxir = v.r - 1;
  const bor = s.qatorlar.length > 0;
  v.qator('jami', () => [
    null, null, 'ИТОГО обороты за период', null, null,
    bor ? { f: `SUM(${F}${bosh}:${F}${oxir})`, v: s.dt } : 0,
    bor ? { f: `SUM(${G}${bosh}:${G}${oxir})`, v: s.kt } : 0,
    null, null, null,
  ]);
  const jamiQator = v.r - 1;
  v.qator('vsego', () => [
    null, null, 'Сальдо на конец периода', null, null, null, null,
    { f: `${S}${och}+${F}${jamiQator}-${G}${jamiQator}`, v: s.yopilish }, null, null,
  ]);
  v.izoh(s.yopilish > 0 ? `По данным организации контрагент должен ${new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2 }).format(s.yopilish)} сум.`
    : s.yopilish < 0 ? `По данным организации мы должны контрагенту ${new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2 }).format(-s.yopilish)} сум.` : 'Взаимных задолженностей нет.');
  v.izoh('От контрагента: ____________________  (подпись)      М.П.      Данные контрагента вносятся в графы «По данным контрагента».');
  v.imzo(imzoTomonlari(['СОСТАВИЛ', 'ПРОВЕРИЛ']));
  const { bytes } = rasmiyKitob([v]);
  return { bytes, faylNomi: hujjatFaylNomi({ obyekt: k.kontragent, hujjat: 'АКТ_СВЕРКИ', davr: `${k.dan}_${k.gacha}` }) };
}

export type OsvKirish = { kompaniya: string | null; osv: BuxOsv };

/** Оборотно-сальдовая ведомость (ОСВ) — RUS: schyot bo'yicha davr boshi / oborot / davr oxiri (Dt | Kt ikki katak). Summalar QQS bilan; jami qatori formula. */
export function osvHujjat(k: OsvKirish): { bytes: Uint8Array; faylNomi: string } {
  const v = new RasmiyVaraq({
    nom: 'ОСВ',
    kattaHarf: false,
    sarlavha: 'ОБОРОТНО-САЛЬДОВАЯ ВЕДОМОСТЬ',
    ostSarlavha: [`за период с ${ddmmyyyy(k.osv.dan)} по ${ddmmyyyy(k.osv.gacha)}`, 'Суммы с НДС.'],
    titul: [['Организация:', k.kompaniya ?? null], ['Дата составления:', ddmmyyyy(bugunSana())]],
    ustunlar: [
      { sarlavha: 'Счёт', kenglik: 9, tur: 'kod' },
      { sarlavha: 'Наименование', kenglik: 40, tur: 'matn' },
      { sarlavha: 'Дебет', kenglik: 17, tur: 'pul', guruh: 'Сальдо на начало' },
      { sarlavha: 'Кредит', kenglik: 17, tur: 'pul', guruh: 'Сальдо на начало' },
      { sarlavha: 'Дебет', kenglik: 17, tur: 'pul', guruh: 'Обороты за период' },
      { sarlavha: 'Кредит', kenglik: 17, tur: 'pul', guruh: 'Обороты за период' },
      { sarlavha: 'Дебет', kenglik: 17, tur: 'pul', guruh: 'Сальдо на конец' },
      { sarlavha: 'Кредит', kenglik: 17, tur: 'pul', guruh: 'Сальдо на конец' },
    ],
    yonalish: 'landscape',
  });
  const bosh = v.r;
  const ds = (n: number | null) => (n == null || n === 0 ? null : yaxlit2(n));
  const ustun: number[][] = [[], [], [], [], [], []];
  for (const q of k.osv.qatorlar) {
    const o = saldoTomoni(q.ochilish); const y = saldoTomoni(q.yopilish);
    [o.dt, o.kt, q.dt, q.kt, y.dt, y.kt].forEach((x, i) => ustun[i].push(x ?? 0));
    v.qator('ish', () => [q.kod, q.nom_ru ?? q.nom_uz ?? null, ds(o.dt), ds(o.kt), ds(q.dt), ds(q.kt), ds(y.dt), ds(y.kt)] as Qiymat[]);
  }
  const oxir = v.r - 1;
  if (k.osv.qatorlar.length > 0) {
    const yig = (i: number): Qiymat => ({ f: `SUM(${ustunHarfi(i + 2)}${bosh}:${ustunHarfi(i + 2)}${oxir})`, v: yigindi2(ustun[i]) });
    v.qator('jami', () => [null, 'ИТОГО', yig(0), yig(1), yig(2), yig(3), yig(4), yig(5)]);
  }
  v.imzo(imzoTomonlari(['СОСТАВИЛ', 'ПРОВЕРИЛ']));
  const { bytes } = rasmiyKitob([v]);
  return { bytes, faylNomi: hujjatFaylNomi({ obyekt: k.kompaniya ?? 'ОСВ', hujjat: 'ОСВ', davr: `${k.osv.dan}_${k.osv.gacha}` }) };
}

/** Balans / Foyda va zarar (jurnaldan) — RUS Excel: kod | ko'rsatkich | summa. Jami qatorlari qalin; xarita T (tekshirilsin) belgisi izohda. */
export function hisobotHujjat(k: { kompaniya: string | null; h: BuxHisobot }): { bytes: Uint8Array; faylNomi: string } {
  const balans = k.h.forma === 'balans';
  const v = new RasmiyVaraq({
    nom: balans ? 'Баланс' : 'Прибыли и убытки',
    kattaHarf: false,
    sarlavha: balans ? 'БУХГАЛТЕРСКИЙ БАЛАНС (по данным журнала проводок)' : 'ОТЧЁТ О ПРИБЫЛЯХ И УБЫТКАХ (по данным журнала проводок)',
    ostSarlavha: [balans ? `на ${ddmmyyyy(k.h.gacha)}` : `за период с ${ddmmyyyy(k.h.dan ?? '')} по ${ddmmyyyy(k.h.gacha)}`, 'Т — форма и соответствие статей счетам не подтверждены бухгалтером; суммы с НДС.'],
    titul: [['Организация:', k.kompaniya ?? null], ['Дата составления:', ddmmyyyy(bugunSana())]],
    ustunlar: [
      { sarlavha: 'Код', kenglik: 10, tur: 'kod' },
      { sarlavha: 'Показатель', kenglik: 56, tur: 'matn' },
      { sarlavha: 'Счета', kenglik: 26, tur: 'kod' },
      { sarlavha: 'Сумма', kenglik: 20, tur: 'pul' },
    ],
    yonalish: 'portrait',
  });
  for (const q of k.h.qatorlar) v.qator(q.tur === 'jami' ? 'jami' : 'ish', () => [q.kod, q.nom_ru, q.hisoblar.join(', ') || null, yaxlit2(q.summa)] as Qiymat[]);
  v.imzo(imzoTomonlari(['СОСТАВИЛ', 'ПРОВЕРИЛ']));
  const { bytes } = rasmiyKitob([v]);
  return { bytes, faylNomi: hujjatFaylNomi({ obyekt: k.kompaniya ?? 'Баланс', hujjat: balans ? 'БАЛАНС' : 'ПРИБЫЛИ_УБЫТКИ', davr: `${k.h.dan ?? ''}_${k.h.gacha}` }) };
}

const SVERKA_HOLAT_RU: Record<string, string> = { mos: 'Совпадает', sana_farq: 'Расхождение по дате', summa_farq: 'Расхождение по сумме', faqat_men: 'Только у нас', faqat_ular: 'Только у контрагента' };

/** Tomonlararo akt-sverka (взаимных расчётов, по данным ОБЕИХ учётов) — RUS Excel. Imzo: shu fayl arxivga saqlanib, taqdim -> qaror zanjiri orqali ikkinchi tomonga yuboriladi. */
export function sverkaTomonHujjat(k: { kompaniya: string | null; s: BuxSverka }): { bytes: Uint8Array; faylNomi: string } {
  const v = new RasmiyVaraq({
    nom: 'Акт сверки',
    kattaHarf: false,
    sarlavha: 'АКТ СВЕРКИ ВЗАИМНЫХ РАСЧЁТОВ (по данным двух учётов)',
    ostSarlavha: [`за период с ${ddmmyyyy(k.s.dan)} по ${ddmmyyyy(k.s.gacha)}`, 'Сальдо: «+» — контрагент должен нам; «−» — мы должны контрагенту. Суммы с НДС. Сопоставление строк приблизительное (Т — проверить).'],
    titul: [['Организация:', k.kompaniya ?? null], ['Контрагент:', k.s.qarshi_nom ?? null], ['Дата составления:', ddmmyyyy(bugunSana())]],
    ustunlar: [
      { sarlavha: '№ п/п', kenglik: 6, tur: 'tartib' },
      { sarlavha: 'Дата', kenglik: 12, tur: 'kod', guruh: 'По нашим данным' },
      { sarlavha: 'Документ', kenglik: 28, tur: 'matn', guruh: 'По нашим данным' },
      { sarlavha: 'Сумма', kenglik: 16, tur: 'pul', guruh: 'По нашим данным' },
      { sarlavha: 'Дата', kenglik: 12, tur: 'kod', guruh: 'По данным контрагента' },
      { sarlavha: 'Сумма', kenglik: 16, tur: 'pul', guruh: 'По данным контрагента' },
      { sarlavha: 'Разница', kenglik: 16, tur: 'pul' },
      { sarlavha: 'Статус', kenglik: 26, tur: 'matn' },
    ],
    yonalish: 'landscape',
  });
  v.qator('oddiy', () => [null, ddmmyyyy(k.s.dan), 'Сальдо на начало периода', yaxlit2(k.s.ochilish_men), null, yaxlit2(k.s.ochilish_ular), yaxlit2(k.s.ochilish_men - k.s.ochilish_ular), null] as Qiymat[]);
  k.s.qatorlar.forEach((q, i) => v.qator('ish', () => [i + 1, q.a_sana ? ddmmyyyy(q.a_sana) : null, q.hujjat ?? null, q.a_summa == null ? null : yaxlit2(q.a_summa),
    q.b_sana ? ddmmyyyy(q.b_sana) : null, q.b_summa == null ? null : yaxlit2(q.b_summa), yaxlit2(q.farq), SVERKA_HOLAT_RU[q.holat] ?? q.holat] as Qiymat[]));
  v.qator('jami', () => [null, null, 'Сальдо на конец периода', yaxlit2(k.s.yopilish_men), null, yaxlit2(k.s.yopilish_ular), yaxlit2(k.s.farq), k.s.farqli_soni > 0 ? `Расхождений: ${k.s.farqli_soni}` : 'Расхождений нет'] as Qiymat[]);
  v.izoh('Подписано сторонами через модуль «Стороны» (передача документа и решение принять/вернуть).');
  v.imzo(imzoTomonlari(['СОСТАВИЛ', 'ПРОВЕРИЛ']));
  const { bytes } = rasmiyKitob([v]);
  return { bytes, faylNomi: hujjatFaylNomi({ obyekt: k.s.qarshi_nom ?? 'контрагент', hujjat: 'АКТ_СВЕРКИ_СТОРОН', davr: `${k.s.dan}_${k.s.gacha}` }) };
}

/** Kassa order (приходный / расходный кассовый ордер) — RUS Excel, bitta varaq. Shakl tafsilotlari T (tekshirilsin): rasmiy shakl bilan buxgalter solishtiradi. */
export function kassaOrderHujjat(k: { kompaniya: string | null; order: KassaKitob['orderlar'][number]; kassaHisob: string }): { bytes: Uint8Array; faylNomi: string } {
  const kirim = k.order.tur === 'kirim';
  const v = new RasmiyVaraq({
    nom: kirim ? 'ПКО' : 'РКО',
    kattaHarf: false,
    sarlavha: kirim ? `ПРИХОДНЫЙ КАССОВЫЙ ОРДЕР № ${k.order.raqam}/${k.order.yil}` : `РАСХОДНЫЙ КАССОВЫЙ ОРДЕР № ${k.order.raqam}/${k.order.yil}`,
    ostSarlavha: [`от ${ddmmyyyy(k.order.sana)}`, 'Т — форма ордера уточняется бухгалтером.'],
    titul: [['Организация:', k.kompaniya ?? null], ['Контрагент:', k.order.kontragent ?? null], ['Основание:', k.order.asos ?? null]],
    ustunlar: [
      { sarlavha: kirim ? 'Дебет (касса)' : 'Дебет (корр. счёт)', kenglik: 18, tur: 'kod' },
      { sarlavha: kirim ? 'Кредит (корр. счёт)' : 'Кредит (касса)', kenglik: 18, tur: 'kod' },
      { sarlavha: 'Сумма', kenglik: 20, tur: 'pul' },
    ],
    yonalish: 'portrait',
  });
  v.qator('ish', () => [kirim ? k.kassaHisob : k.order.qarshi_hisob, kirim ? k.order.qarshi_hisob : k.kassaHisob, yaxlit2(k.order.summa)] as Qiymat[]);
  v.imzo(imzoTomonlari(['СОСТАВИЛ', 'ПРОВЕРИЛ']));
  const { bytes } = rasmiyKitob([v]);
  return { bytes, faylNomi: hujjatFaylNomi({ obyekt: k.kompaniya ?? 'касса', hujjat: kirim ? 'ПКО' : 'РКО', davr: `${k.order.yil}_${k.order.raqam}` }) };
}