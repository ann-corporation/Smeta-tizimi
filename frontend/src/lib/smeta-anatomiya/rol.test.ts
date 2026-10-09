import { describe, expect, it } from 'vitest';
import { varaqNomiRoli, varaqRoliniAniqla } from './rol';

const rol = (nom: string) => varaqNomiRoli(nom)?.rol ?? null;

describe('varaq nomi bo‘yicha rol — har xil yozilishlar', () => {
  it('LRV variantlari', () => {
    for (const n of ['LRV', 'lrv', '_ЛРВ', 'ЛРВ', 'LRV_PLUS', 'Lrv plus', '1-LRV', 'ЛРВ (2)', 'ЛСР', 'Локальная смета', 'Смета', 'smeta 01-02', 'ЛОКАЛЬНЫЙ СМЕТНЫЙ РАСЧЕТ'])
      expect([n, rol(n)]).toEqual([n, 'lrv']);
  });
  it('RES variantlari (lotin PC → kirill РС ham)', () => {
    for (const n of ['RES', 'res', 'RES_A', '_РС', 'РС', '_PC', 'РЕС', 'PEC', 'Ресурсы', 'Ведомость ресурсов', 'RESURS', 'Ресурслар', 'RS-2'])
      expect([n, rol(n)]).toEqual([n, 'res']);
  });
  it('svod, transport, noaniq', () => {
    expect(rol('СВОД')).toBe('svod');
    expect(rol('Сводная смета')).toBe('svod');
    expect(rol('итого')).toBe('svod');
    expect(rol('Транспорт')).toBe('transport');
    expect(rol('Перевозка грузов')).toBe('transport');
    expect(rol('Лист1')).toBeNull();
    expect(rol('5200_БР')).toBeNull();
    expect(rol('LRV_RES')).toBeNull(); // ikkalasi — tuzilma hal qiladi
  });
});

describe('nom + ichki tuzilma', () => {
  // ABC RES shakli: guruhlar (ТРУДОВЫЕ / МАТЕРИАЛЫ) + КОД, НАИМЕНОВАНИЕ, ЕД.ИЗМ, КОЛ-ВО, ЦЕНА, СУММА
  const RES_ROWS = [
    ['№', 'КОД РЕСУРСА', 'НАИМЕНОВАНИЕ РЕСУРСА', 'ЕД.ИЗМ', 'КОЛ-ВО', 'ЦЕНА', 'СУММА'],
    [null, null, 'ТРУДОВЫЕ РЕСУРСЫ', null, null, null, null],
    [1, '1-100', 'ЗАТРАТЫ ТРУДА РАБОЧИХ', 'ЧЕЛ-Ч', 10, 20000, 200000],
    [2, '1-101', 'ЗАТРАТЫ ТРУДА РАБОЧИХ 4 РАЗР', 'ЧЕЛ-Ч', 5, 21000, 105000],
    [null, null, 'СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ', null, null, null, null],
    [3, 'С401', 'БЕТОН В25', 'М3', 4, 500000, 2000000],
    [4, 'С402', 'ПЕСОК', 'М3', 2, 100000, 200000],
    [5, 'С403', 'ЩЕБЕНЬ', 'М3', 3, 120000, 360000],
  ];
  it('noaniq nomli varaq — tuzilma bo‘yicha RES', () => {
    expect(varaqRoliniAniqla('5200_БР', RES_ROWS)).toMatchObject({ rol: 'res', manba: 'tuzilma' });
  });
  it('aniq nom tuzilma bilan bir xil — yuqori ishonch; zid bo‘lsa nom qoladi, ogohlantirish bilan', () => {
    expect(varaqRoliniAniqla('_РС', RES_ROWS)).toMatchObject({ rol: 'res', ishonch: 'yuqori' });
    const zid = varaqRoliniAniqla('_ЛРВ', RES_ROWS);
    expect(zid).toMatchObject({ rol: 'lrv', ishonch: 'orta', manba: 'nom' });
    expect(zid.dalil[0]).toMatch(/tekshiring/);
  });
});
