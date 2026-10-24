import { describe, expect, it } from 'vitest';
import { kitobAnatomiyasi } from './index';
import type { Katak } from './turlar';

/** Italiya _ЕД shakli (sintetik): ikkinchi bo'lim oldida jadval sarlavhasi va obyekt nomi takrorlanadi (#25). */
const ROWS: Katak[][] = [
  ['НАИМЕНОВАНИЕ СТРОЙКИ: ТЕСТ'],
  ['НАИМЕНОВАНИЕ ОБЪЕКТА: ТЕСТ ОБЪЕКТ'],
  [],
  ['ЛОКАЛЬНАЯ РЕСУРСНАЯ ВЕДОМОСТЬ № 01'],
  ['№№', 'ОБОСНОВАНИЕ', 'НАИМЕНОВАНИЕ РАБОТ И РЕСУРСОВ', 'ЕД.ИЗМ', 'КОЛ-ВО'],
  [null, null, null, null, 'НА ЕДИНИЦУ', 'ПО ПРОЕКТУ'],
  [1, 2, 3, 4, 5, 6],
  ['РАЗДЕЛ: ФУНДАМЕНТ'],
  ['1', 'E1-1-195-20', 'РАЗРАБОТКА ГРУНТА', '1000М3', '0,01017'],
  ['1.1', '000001', 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'ЧЕЛ-Ч', '5,02', '0,05'],
  ['ТЕСТ ОБЪЕКТ'],
  ['N п.п.'],
  ['на. ед. измерения'],
  ['РАЗДЕЛ: СТЕНЫ'],
  ['2', '615-1', 'БЕТОН КЛ. В12,5', 'М3', '3,6'],
  ['2.1', '000001', 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'ЧЕЛ-Ч', '1,5', '5,4'],
];

describe('takroriy ustun-sarlavhalar bo‘lim bo‘lmaydi (#25)', () => {
  it('«N п.п.», «на. ед. измерения» va obyekt nomi takrori rz emas', () => {
    const v = kitobAnatomiyasi({ fayl: 'k.xls', varaqlar: [{ nom: 'LRV', rows: ROWS }] }).varaqlar[0];
    const nomlar = v.sarlavhalar.map((s) => s.xom.toUpperCase());
    expect(nomlar.some((n) => /П\.П|ИЗМЕРЕНИЯ/.test(n))).toBe(false);
    expect(nomlar.filter((n) => n === 'ТЕСТ ОБЪЕКТ')).toHaveLength(0);
    expect(nomlar.some((n) => /ФУНДАМЕНТ/.test(n))).toBe(true);
    expect(nomlar.some((n) => /СТЕНЫ/.test(n))).toBe(true);
    expect(v.ishlar.length).toBe(2);
  });
});
