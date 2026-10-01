import { describe, expect, it } from 'vitest';
import {
  BEZ_SKLAD_CONTRACT,
  BEZ_SKLAD_KATEGORIYA,
  bezSkladKategoriyaAniqla,
  isBezSkladNom,
} from './bez-sklad';

describe('БЕЗСКЛАД deterministic classifier (nom + birlik)', () => {
  it('recognises ready-mix by name and cubic-metre unit', () => {
    for (const name of ['Товарный бетон В25', 'Бетонная смесь М300', 'Раствор цементный']) {
      expect(bezSkladKategoriyaAniqla(name, null, 'м3')).toMatchObject({ kategoriya: BEZ_SKLAD_KATEGORIYA, manba: 'qoida', ishonch: 'high' });
    }
    expect(isBezSkladNom('Асфальтобетон тип Б', 'т')).toBe(true);
  });

  it('does not decide without a unit', () => {
    expect(bezSkladKategoriyaAniqla('Товарный бетон В25').kategoriya).toBeNull();
  });

  it('does not misclassify storeable concrete goods', () => {
    for (const [name, b] of [['Бетонные блоки', 'шт'], ['Блоки железобетонные', 'м3'], ['Железобетонные конструкции', 'м3'], ['Плиты бетонные', 'м2']]) {
      expect(isBezSkladNom(name, b)).toBe(false);
    }
  });

  it('does not guess unrelated names', () => {
    expect(bezSkladKategoriyaAniqla('Кирпич керамический', null, 'шт').kategoriya).toBeNull();
    expect(bezSkladKategoriyaAniqla('', null, 'м3').kategoriya).toBeNull();
  });

  it('operator decision is explicit and wins over the rule', () => {
    expect(bezSkladKategoriyaAniqla('Раствор', 'БЕЗСКЛАД').manba).toBe('operator');
    expect(bezSkladKategoriyaAniqla('Раствор', 'МАТ', 'м3')).toMatchObject({ kategoriya: null, manba: 'operator' });
  });

  it('exposes the no-warehouse contract without changing value semantics', () => {
    expect(BEZ_SKLAD_CONTRACT).toEqual({ warehouseMarkup: false, directCostBucket: 'mat', category: 'БЕЗСКЛАД' });
  });
});
