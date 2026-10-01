import { describe, expect, it } from 'vitest';
import { isBezSkladNom } from './bez-sklad';

/**
 * `public.t2_bez_sklad_nomzodmi(text)` (migratsiya 20261105190000, Ombor agenti) shu modulning
 * SQL egizagi. Quyidagi jadval production'da SQL funksiyadan olingan natijalar (2026-10-01);
 * TS qoidasi o'zgarsa — SQL funksiya ham yangilanishi shart, aks holda bu test yiqiladi.
 */
const SQL_NATIJA: ReadonlyArray<readonly [string, boolean]> = [
  ['Бетон тяжелый класса В25', true],
  ['Товарный бетон М300', true],
  ['Раствор готовый кладочный цементный М100', true],
  ['Блоки бетонные стен подвалов', false],
  ['Железобетонные конструкции', false],
  ['Смесь сухая бетонная', false],
  ['Асфальтобетон плотный', true],
  ['Бетонные смеси', true],
  ['Плиты бетонные', false],
  ['Арматура А500С', false],
  ['Сухая смесь бетон', false],
  ['Трубы бетонные', false],
  ['Бетон В15 (раствор)', true],
  ['РАСТВОРИТЕЛЬ МАРКИ Р-4', false],
  ['БЕНЗИН РАСТВОРИТЕЛЬ', false],
  ['АЦЕТИЛЕН РАСТВОРЕННЫЙ ТЕХНИЧЕСКИЙ МАРКИ А', false],
  ['ЦЕМЕНТ ДЛЯ ПРИГОТОВЛЕНИЯ РАСТВОРА В ПОСТРОЕЧНЫХ УСЛОВИЯХ', false],
  ['ПЕСОК ДЛЯ СТРОИТЕЛЬНЫХ РАБОТ ПРИРОДНЫЙ ДЛЯ СТРОИТЕЛЬНЫХ РАСТВОРОВ: СРЕДНИЙ', false],
  ['СМЕСЬ РАСТВОРНАЯ СУХАЯ', false],
  ['ЦЕМЕНТНО-ПЕСЧАННЫЙ КЛЕЕВОЙ РАСТВОР М-500 F75', false],
  ['МОЮЩЕЕ СРЕДСТВО (РАСТВОР)', false],
  ['ДЮБЕЛЬ ПЛАСТИКОВЫЙ 7ММ ДЛЯ БЕТОН', false],
  ['ДЕКОРАТИВНАЯ ГОТОВАЯ ИЗДЕЛИЙ /СОСТАВ - БЕТОН КЛ.В15', false],
  ['ЦЕМЕНТНО-ПЕСЧАННЫЙ РАСТВОР М100', true],
  ['ЦЕМ.ПЕСЧАННЫЙ РАСТВОР М200', true],
  ['СМЕСЬ АСФАЛЬТОБЕТОННАЯ ПЛОТНАЯ ГОРЯЧАЯ', true],
  ['РАСТВОР ГОТОВЫЙ КЛАДОЧНЫЙ ЦЕМЕНТНЫЙ М100', true],
];

describe('БЕЗСКЛАД — TS va SQL egizak qoidasi', () => {
  it.each(SQL_NATIJA)('%s → %s', (nom, kutilgan) => {
    expect(isBezSkladNom(nom)).toBe(kutilgan);
  });
});
