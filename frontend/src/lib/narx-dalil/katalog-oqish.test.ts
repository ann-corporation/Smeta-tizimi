import { describe, expect, it } from 'vitest';
import { katalogniOqi, katalogSon } from './katalog-oqish';

const KATALOG = [
  ['Каталог текущих цен на строительные ресурсы, 3 квартал 2026'],
  ['№', 'Код ресурса', 'Наименование ресурса', 'Ед. изм.', 'Цена, сум'],
  [1, 2, 3, 4, 5],
  ['РАЗДЕЛ 1. МАТЕРИАЛЫ'],
  ['1', 'C101-0001', 'Бетон тяжелый B25', 'м3', '950 000,00'],
  ['2', 'C101-0002', 'Раствор цементный М100', 'м3', 620000],
  ['3', 'C101-0003', 'Песок', 'м3', ''],
  [null, null, 'ИТОГО', null, 1570000],
];

describe('Narx manbasi — katalog varag‘i (anatomiya orqali)', () => {
  it('son: bo‘shliq va vergul, matn emas', () => {
    expect(katalogSon('950 000,00')).toBe(950000);
    expect(katalogSon('abc')).toBeNull();
    expect(katalogSon('')).toBeNull();
  });

  it('ustunlar anatomiyadan; bo‘lim sarlavhasi va ИТОГО tashlanadi; narxsiz — NULL', () => {
    const n = katalogniOqi('Каталог', KATALOG);
    expect(n.manba).toBe('anatomiya');
    expect(n.qatorlar.map((q) => [q.kod, q.nom, q.birlik, q.narx])).toEqual([
      ['C101-0001', 'Бетон тяжелый B25', 'м3', 950000],
      ['C101-0002', 'Раствор цементный М100', 'м3', 620000],
      ['C101-0003', 'Песок', 'м3', null],
    ]);
    expect(n.narxsiz).toBe(1);
  });

  it('operator ustunlarni ko‘rsatsa — shu ustunlar bilan', () => {
    const rows = [['Наим', 'Ед', 'Сумма'], ['Кран 25 т', 'маш.-ч', '180000']];
    const n = katalogniOqi('x', rows, { kod: -1, nom: 0, birlik: 1, narx: 2, boshQator: 1 });
    expect(n.manba).toBe('operator');
    expect(n.qatorlar).toEqual([{ kod: null, nom: 'Кран 25 т', birlik: 'маш.-ч', narx: 180000 }]);
  });
});
