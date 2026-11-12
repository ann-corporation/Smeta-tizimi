/**
 * Akt-sverka (взаимных расчётов) Excel — RUS, hujjat-yozuvchi `RasmiyVaraq` (H1–H9). Bitta kontragent, davr ichida hujjatlar bo'yicha:
 * № | Дата | Документ | Договор | Счёт | Дебет | Кредит | Сальдо (yurma, formula) | «По данным контрагента» Дебет/Кредit (bo'sh — kontragent to'ldiradi).
 * Saldo = Дебет − Кредит: «+» — контрагент должен нам, «−» — мы должны контрагенту. Summalar QQS bilan. Rang yo'q, jami qalin, imzo bloki.
 */
import { RasmiyVaraq, bugunSana, hujjatFaylNomi, imzoTomonlari, rasmiyKitob, ustunHarfi, type Qiymat } from '../hujjat-yozuvchi';
import { yaxlit2, yigindi2 } from '../hisob-yadro';
import { sverkaQatorlari, saldoTomoni } from './hisob';
import type { BuxHujjatQator, BuxOsv } from '../../api/t2-bux-hisob';

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
