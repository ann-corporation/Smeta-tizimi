import { describe, expect, it } from 'vitest';
import { davrNomdan, manbaTuriniAniqla, nashrniOqi, nashrSarlavhasi } from './manba-xls';
import { indeksdanNashrlar, nashrlarniBirlashtir, reviziyaQur } from './nashr-birlashtir';
import { praysNashri } from './nashr-yuklash';

const katalogVaraq = (narxlar: Array<[string, string, ...Array<number | string>]>) => [
  ['№ п/п', 'Наименование выпускаемой продукции по маркам, типоразмерам', 'Ед. изм', 'Отпускная текущая цена', null, null, null, null, null],
  ['№ п/п', 'Наименование выпускаемой продукции по маркам, типоразмерам', 'Ед. изм', 'с НДС', 'с НДС', 'с НДС', 'без НДС', 'без НДС', 'без НДС'],
  ['№ п/п', 'Наименование выпускаемой продукции по маркам, типоразмерам', 'Ед. изм', '01.02.2026', '01.03.2026', '01.04.2026', '01.02.2026', '01.03.2026', '01.04.2026'],
  [1, 2, 3, 4, 5, 6, 7, 8, 9],
  ['1. ООО ЗАВОД БЕТОН (НДС 12%) Руководитель: Иванов', '1. ООО ЗАВОД БЕТОН (НДС 12%) Руководитель: Иванов', '1. ООО ЗАВОД БЕТОН (НДС 12%) Руководитель: Иванов'],
  [null, 'Бетон товарный', 'Бетон товарный', 'Бетон товарный'],
  ...narxlar.map((r, i) => [i + 1, ...r]),
];
const birjaVaraq = [
  ['Узбекская республиканская товарно-сырьевая биржа. Котировки цен'],
  ['№ п/п', 'Наименование продукции', 'Ед. измерения', 'Текущие котировки цен (средневзвешенные цены), сум'],
  [null, null, null, '24.03.2025 по 30.03.2025'],
  [1, 'Портландцемент ПЦ 400 (в мешках)', 'тн', 1120000],
  [2, 'Доска обрезная (куб.метр)', 'м3', 3750000, 3348214.2857],
];

describe('rasmiy nashrlarni o‘qish', () => {
  it('katalog: hudud varag‘i, QQSsiz ustunlar, oylar ichida ENG QIMMAT narx, ishlab chiqaruvchi va guruh', () => {
    const n = nashrniOqi('Каталог 1 кв. 2026 г..xls', [
      { nom: 'г. Ташкент, сум', rows: katalogVaraq([['Бетон В15', 'м3', 900000, 950000, '-', 803571, 848214, '-']]) },
      { nom: 'г. Ташкент, доллар США', rows: katalogVaraq([['Бетон В15', 'м3', 80, 80, 80, 71, 71, 71]]) },
    ]);
    expect(n).toMatchObject({ tur: 'katalog', yil: 2026, kvartal: 1, sana: '2026-03-01' });
    expect(n.qatorlar).toEqual([expect.objectContaining({ nom: 'Бетон В15', birlik: 'м3', narx: 848214, hudud: 'г. Ташкент', zavod: 'ООО ЗАВОД БЕТОН (НДС 12%)', guruh: 'Бетон товарный' })]);
    expect(n.hisob.olinmaganVaraqlar[0]).toContain('valyuta');
  });
  it('birja: QQSsiz ustun bo‘lsa o‘shani oladi, bo‘lmasa ÷ 1,12 va izoh yozadi', () => {
    expect(manbaTuriniAniqla([{ nom: 'март', rows: birjaVaraq }])).toBe('birja');
    const n = nashrniOqi('3-Биржа за март 2025 года.xls', [{ nom: 'март', rows: birjaVaraq }]);
    expect(n).toMatchObject({ tur: 'birja', yil: 2025, oy: 3, sana: '2025-03-30' });
    expect(n.qatorlar[0]).toMatchObject({ narx: 1000000, izoh: expect.stringContaining('÷ 1,12') });
    expect(n.qatorlar[1]).toMatchObject({ narx: 3348214.29, hudud: null });
    expect(n.hisob.hisoblanganQqs).toBe(1);
    expect(nashrSarlavhasi(n)).toBe('Котировки УзРТСБ, март 2025 г.');
  });
  it('davr fayl nomidan (hujjatning o‘z sarlavhasi)', () => {
    expect(davrNomdan('Каталог 1-кв. 2025 (2).xls')).toEqual({ yil: 2025, kvartal: 1 });
    expect(davrNomdan('КАТАЛОГ 4-КВ2025.xls')).toEqual({ yil: 2025, kvartal: 4 });
    expect(davrNomdan('Каталог_цен_РУз,_2025_год,_III_квартал.xls')).toEqual({ yil: 2025, kvartal: 3 });
    expect(davrNomdan('Каталог 2025 года 2 квартал.xls')).toEqual({ yil: 2025, kvartal: 2 });
  });
});

describe('ko‘p nashrli indeks', () => {
  const eski = nashrniOqi('Каталог 1 кв. 2025.xls', [{ nom: 'г. Ташкент, сум', rows: katalogVaraq([['Бетон В15', 'м3', 0, 0, 0, 700000, 700000, 700000], ['Бетон В25', 'м3', 0, 0, 0, 900000, 900000, 900000]]) }]);
  const yangi = nashrniOqi('Каталог 1 кв. 2026.xls', [{ nom: 'г. Ташкент, сум', rows: katalogVaraq([['Бетон В15', 'м3', 0, 0, 0, 800000, 810000, 805000]]) }]);
  it('bir mahsulot — eng yangi nashr; yangisida yo‘q mahsulot eski nashrdan; har qator o‘z manbasiga bog‘liq', async () => {
    const b = nashrlarniBirlashtir([yangi, eski]);
    expect(b.rows.map(r => [r[3], r[5], b.dict.manbalar![r[14]!].nom])).toEqual([
      ['Бетон В25', '900000', 'Каталог цен РУз, 1 кв. 2025 г.'],
      ['Бетон В15', '810000', 'Каталог цен РУз, 1 кв. 2026 г.'],
    ]);
    expect(b.counts.eskirganTashlandi).toBe(1);
    // Adding a newer edition never renumbers rows of the older ones (stable evidence ids).
    expect(nashrlarniBirlashtir([eski]).rows[1][0]).toBe(b.rows[0][0]);
    const r1 = await reviziyaQur(b, [], 'x'), r2 = await reviziyaQur(nashrlarniBirlashtir([eski, yangi]), [], 'y');
    expect(r1.revision).toMatch(/^[a-f0-9]{16}$/);
    expect(r1.revision).toBe(r2.revision);
    expect(indeksdanNashrlar(b.dict, b.rows).map(n => n.qatorlar.length)).toEqual([1, 1]);
  });
  it('prays-list: QQS bilan bo‘lsa ÷ 1,12, birliksiz/narxsiz pozitsiya olinmaydi', () => {
    const p = praysNashri({ nom: 'Akfa.xlsx', yetkazuvchi: 'AKFA', sana: '2026-09-01', nds: 'nds_bilan', hudud: null,
      qatorlar: [{ nom: 'Профиль 60', birlik: 'м', narx: 112000 }, { nom: 'Без цены', birlik: 'м', narx: null }, { nom: 'Без ед.', birlik: null, narx: 5 }] });
    expect(p.qatorlar).toEqual([expect.objectContaining({ nom: 'Профиль 60', narx: 100000, zavod: 'AKFA' })]);
    expect(nashrSarlavhasi(p)).toBe('Прайс-лист AKFA от 01.09.2026');
  });
});
