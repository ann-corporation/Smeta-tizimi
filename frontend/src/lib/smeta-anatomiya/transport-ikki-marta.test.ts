/**
 * Transport ikki marta qo'riqchisi: aniq т·км / «Транспортные расходы …» qatorlari + podval foizi. Sintetik ma'lumot.
 */
import { describe, expect, it } from 'vitest';
import { nakrutkaPodvaliniOqi, transportIkkiMarta } from './nakrutka';
import type { Katak } from './turlar';

const TKM_ISH = [
  { tur: 'rz', nom: 'ПЕРЕВОЗКА ГРУЗОВ (трансп.)' },
  { tur: 'bl', kod: 'РАСЧЁТ Т·КМ', nom: 'ПЕРЕВОЗКА МЕСТНЫХ МАТЕРИАЛОВ АВТОСАМОСВАЛАМИ (РАСЧЁТ ЗАТРАТ ТРАНСПОРТА, 1 000 СУМ ЗА 1 Т·КМ)', birlik: 'Т·КМ', summa: 1_300_000 },
  { tur: 'rs', kod: 'Т·КМ', nom: 'ПЕРЕВОЗКА: МАТЕРИАЛ А — 100 ТН × 10 КМ', birlik: 'Т·КМ', summa: 1_000_000 },
  { tur: 'rs', kod: 'Т·КМ', nom: 'ПЕРЕВОЗКА: МАТЕРИАЛ Б — 10 М3 = 15 Т × 20 КМ', birlik: 'Т·КМ', summa: 300_000 },
];

describe('transportIkkiMarta', () => {
  it('т·км qatorlari + ТРАНСПОРТ_МАТЕРИАЛ > 0 — ogohlantirish (ish summasi resurslar bilan takror sanalmaydi)', () => {
    const n = transportIkkiMarta(TKM_ISH, { ТРАНСПОРТ_МАТЕРИАЛ: 5 });
    expect(n).toMatchObject({ kod: 'transport_ikki_marta', koefKodlari: ['ТРАНСПОРТ_МАТЕРИАЛ'], material: { soni: 2, summa: 1_300_000 }, uskuna: { soni: 0, summa: null } });
    expect(n!.izoh).toMatch(/ikki marta/);
    expect(n!.izoh).toContain('5%');
  });

  it('foiz 0 / yo‘q yoki aniq qator yo‘q — null', () => {
    expect(transportIkkiMarta(TKM_ISH, { ТРАНСПОРТ_МАТЕРИАЛ: 0 })).toBeNull();
    expect(transportIkkiMarta(TKM_ISH, {})).toBeNull();
    expect(transportIkkiMarta([{ tur: 'rs', nom: 'Бетон', birlik: 'м3', summa: 10 }], { ТРАНСПОРТ_МАТЕРИАЛ: 5 })).toBeNull();
  });

  it('nomi bo‘yicha: «Транспортные расходы на привозные материалы» va «… на перевозку оборудования»', () => {
    const n = transportIkkiMarta([
      { tur: 'bl', nom: 'Транспортные расходы на привозные материалы', birlik: 'сум', summa: 500 },
      { tur: 'bl', nom: 'Транспортные расходы на перевозку оборудования', birlik: 'сум', summa: null },
    ], { ТРАНСПОРТ_МАТЕРИАЛ: 5, ТРАНСПОРТ_ОБОРУД: 3 });
    expect(n).toMatchObject({ koefKodlari: ['ТРАНСПОРТ_МАТЕРИАЛ', 'ТРАНСПОРТ_ОБОРУД'], material: { soni: 1, summa: 500 }, uskuna: { soni: 1, summa: null } });
    // Faqat uskuna qatori va faqat material foizi — ustma-ust emas.
    expect(transportIkkiMarta([{ tur: 'bl', nom: 'Расходы на перевозку оборудования' }], { ТРАНСПОРТ_МАТЕРИАЛ: 5 })).toBeNull();
  });

  it('birlik yozuvlari: т.км, ткм, тн·км', () => {
    for (const birlik of ['т.км', 'ткм', 'тн·км', 'т км']) {
      expect(transportIkkiMarta([{ tur: 'rs', nom: 'Перевозка щебня', birlik, summa: 1 }], { ТРАНСПОРТ_МАТЕРИАЛ: 2 })).not.toBeNull();
    }
  });
});

describe('nakrutkaPodvaliniOqi — transport ikki marta review', () => {
  const TKM: Katak[][] = [
    [null, 'Расчёт затрат транспорта'],
    [],
    [null, '№', 'Наименование материалов', 'Ед.изм', 'Кол-во', 'Кол-во (тн)', 'Дальность возки (км)', 'Грузооборот тн.км.', 'Стоимость тн.км в сум', 'Стоимость всего сум.'],
    [],
    [null, 1, 'Материал А', 'тн', 100, 100, 10, 1000, 1000, 1_000_000],
    [null, null, 'ИТОГО:', 'сум', null, null, null, null, null, 1_000_000],
  ];
  const SVOD: Katak[][] = [
    ['№', 'НАИМЕНОВАНИЕ ЗАТРАТ', 'Цена'],
    [1, 'ЗАТРАТЫ НА СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ', 10_000_000],
    [2, 'ЗАТРАТЫ НА ТРАНСПОРТНЫЕ РАСХОДЫ', 1_000_000],
    [3, 'ТРАНСПОРТНЫЕ РАСХОДЫ НА ПРИВОЗНЫЕ МАТЕРИАЛЫ-5%', 500_000],
  ];

  it('kitobda tn·km varag‘i + podvalda transport % — review ogohlantirishi (bloklamaydi)', () => {
    const o = nakrutkaPodvaliniOqi({ fayl: 's.xlsx', varaqlar: [{ nom: 'сводн.', rows: SVOD }, { nom: 'трансп.', rows: TKM }] }, { varaqlar: ['сводн.'] });
    expect(o.koeffitsientlar.ТРАНСПОРТ_МАТЕРИАЛ).toBe(5);
    const r = o.review.find((x) => x.kod === 'transport_ikki_marta');
    expect(r).toBeTruthy();
    expect(r!.bloklovchi).toBeFalsy();
    expect(r!.manzil).toMatchObject({ varaq: 'сводн.', qator: 4 });
  });

  it('tn·km varag‘i yo‘q — review yo‘q; obyekt qatorlari berilsa — shular ishlatiladi', () => {
    const k = { fayl: 's.xlsx', varaqlar: [{ nom: 'сводн.', rows: SVOD }] };
    expect(nakrutkaPodvaliniOqi(k).review.some((x) => x.kod === 'transport_ikki_marta')).toBe(false);
    expect(nakrutkaPodvaliniOqi(k, { transportQatorlari: TKM_ISH }).review.some((x) => x.kod === 'transport_ikki_marta')).toBe(true);
  });
});
