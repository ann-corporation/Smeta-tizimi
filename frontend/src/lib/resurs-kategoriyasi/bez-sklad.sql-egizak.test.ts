import { describe, expect, it } from 'vitest';
import { isBezSkladNom } from './bez-sklad';

/**
 * `public.t2_bez_sklad_qoida(nom, birlik)` (migratsiya 20261105210000) — shu modulning SQL
 * egizagi; bazadagi trigger shu bilan ishlaydi. Jadval real smetalardagi holatlardan
 * (2026-10-01). TS qoidasi o'zgarsa — SQL funksiya ham yangilanishi shart.
 */
export const QOIDA_HOLATLARI: ReadonlyArray<readonly [string, string, boolean]> = [
  // egasi qoidasi: beton/rastvor + м³
  ['БЕТОН В20', 'М3', true],
  ['БЕТОН ТЯЖЕЛЫЙ КЛАССА В15 /М-200/', 'м3', true],
  ['Товарный бетон М300', 'М3', true],
  ['ПЛИТЫ ДНЫЩ, БЕТОН КЛ.В12,5', 'М3', true],
  ['ОГОЛОВКИ ИЗ МОНОЛИТНОГО БЕТОНА В15', 'М3', true],
  ['ФИБРОБЕТОН ТОЛЩ.10ММ', 'М3', true],
  ['ЦЕМЕНТНО-ПЕСЧАННЫЙ РАСТВОР М100', 'М3', true],
  ['РАСТВОР ГОТОВЫЙ КЛАДОЧНЫЙ ЦЕМЕНТНЫЙ М100', 'М3', true],
  ['БЕТОН В25', '100 м3', true],
  ['БЕТОН В25', 'м³', true],
  // asfaltobeton — т yoki м³
  ['СМЕСЬ АСФАЛЬТОБЕТОННАЯ ПЛОТНАЯ ГОРЯЧАЯ', 'Т', true],
  ['АСФАЛЬТОБЕТОН ТИП Б', 'М3', true],
  // birlik м³ emas — БЕЗСКЛАД emas
  ['БЕТОН М500 Т.100ММ', 'М2', false],
  ['РАСТВОРИТЕЛЬ МАРКИ Р-4', 'КГ', false],
  ['СМЕСЬ РАСТВОРНАЯ СУХАЯ', 'КГ', false],
  ['ЦЕМЕНТНО-ПЕСЧАННЫЙ КЛЕЕВОЙ РАСТВОР М-500 F75', 'КГ', false],
  ['МОЮЩЕЕ СРЕДСТВО (РАСТВОР)', 'Л', false],
  ['БЛОКИ БЕТОННЫЕ ДЛЯ СТЕН ПОДВАЛОВ ФБС 12.4.6Т', 'ШТ', false],
  ['АРМАТУРА ДЛЯ МОНОЛИТНЫХ ЖЕЛЕЗОБЕТОННЫХ КОНСТРУКЦИЙ', 'Т', false],
  ['БЕТОН В20', '', false],
  // м³ bo'lsa ham omborda saqlanadi
  ['БЛОКИ ИЗ ГАЗОБЕТОНА СТЕНОВЫЕ ТОЛЩИНОЙ 250 ММ', 'М3', false],
  ['ГАЗОБЕТОННЫХ БЛОКОВ 300ММ', 'М3', false],
  ['ПЕСОК ДЛЯ СТРОИТЕЛЬНЫХ РАБОТ ПРИРОДНЫЙ ДЛЯ СТРОИТЕЛЬНЫХ РАСТВОРОВ: СРЕДНИЙ', 'М3', false],
  ['ЩЕБЕНЬ', 'М3', false],
];

describe('БЕЗСКЛАД — egasi qoidasi (beton/rastvor + м³), TS va SQL egizak', () => {
  it.each(QOIDA_HOLATLARI)('%s [%s] → %s', (nom, birlik, kutilgan) => {
    expect(isBezSkladNom(nom, birlik)).toBe(kutilgan);
  });
});
