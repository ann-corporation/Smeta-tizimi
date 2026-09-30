import { describe, expect, it } from 'vitest';
import {
  BEZ_SKLAD_CONTRACT,
  BEZ_SKLAD_KATEGORIYA,
  bezSkladKategoriyaAniqla,
  isBezSkladNom,
} from './bez-sklad';

describe('БЕЗСКЛАД deterministic classifier', () => {
  it('recognises ready-mix and immediate-use materials', () => {
    for (const name of ['Товарный бетон В25', 'Бетонная смесь М300', 'Раствор цементный', 'Асфальтобетон тип Б', 'BETON QORISHMALARI']) {
      expect(bezSkladKategoriyaAniqla(name)).toMatchObject({ kategoriya: BEZ_SKLAD_KATEGORIYA, manba: 'keyword', ishonch: 'high' });
    }
  });

  it('does not misclassify storeable concrete goods', () => {
    for (const name of ['Бетонные блоки', 'Блоки железобетонные', 'Железобетонные конструкции', 'Плиты бетонные']) {
      expect(isBezSkladNom(name)).toBe(false);
    }
  });

  it('does not guess unrelated names', () => {
    expect(bezSkladKategoriyaAniqla('Кирпич керамический').kategoriya).toBeNull();
    expect(bezSkladKategoriyaAniqla('').kategoriya).toBeNull();
  });

  it('operator decision is explicit and wins over the keyword rule', () => {
    expect(bezSkladKategoriyaAniqla('Раствор', 'БЕЗСКЛАД').manba).toBe('operator');
    expect(bezSkladKategoriyaAniqla('Раствор', 'МАТ')).toMatchObject({ kategoriya: null, manba: 'operator' });
  });

  it('exposes the no-warehouse contract without changing value semantics', () => {
    expect(BEZ_SKLAD_CONTRACT).toEqual({ warehouseMarkup: false, directCostBucket: 'mat', category: 'БЕЗСКЛАД' });
  });
});
