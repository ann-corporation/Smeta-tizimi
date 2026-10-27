import { expect, it } from 'vitest';
import { katalogQur, pozitsiyaPul } from '../../src/lib/smeta-versiya/hisob';
import type { JQator } from '../../src/lib/smeta-versiya/pozitsiya';

const resource = (id: number, price: number, category: string, unit = 'М3'): JQator => ({
  id, ota_id: null, tur: 'mat', kod: 'SYNTHETIC-R', nom: 'Synthetic resource',
  birlik: unit, hajm: 1, narx: price, kat: category,
});
const position = (unit: string) => ({ kod: 'SYNTHETIC-R', nom: 'Synthetic position', birlik: unit, hajm: 2, resurslar: [] });

it('does not synthesize a price/category pair absent from every source occurrence', () => {
  const rows = [resource(1, 100, 'МАТ'), resource(2, 100, 'МАТ'),
    resource(3, 100, 'МАШ'), resource(4, 100, 'МАШ'),
    resource(5, 200, 'ОБ'), resource(6, 200, 'ОБ'), resource(7, 200, 'ОБ')];
  const chosen = katalogQur(rows).get('SYNTHETIC-R');
  // A resolver may retain ambiguity. If it chooses a rate, its category must share the same provenance.
  if (chosen) expect(rows.some(r => r.narx === chosen.narx && r.kat === chosen.kat)).toBe(true);
});

it('does not apply a tonne price directly to kilograms without a conversion contract', () => {
  const catalog = katalogQur([resource(1, 1000, 'МАТ', 'Т')]);
  const result = pozitsiyaPul(position('КГ'), catalog);
  expect(result.summa).toBeNull();
  expect(result.narxsiz).toBe(1);
});

it('keeps a uniquely sourced rate when the requested and source units agree', () => {
  const result = pozitsiyaPul(position('Т'), katalogQur([resource(1, 1000, 'МАТ', 'Т')]));
  expect(result.summa).toBe(2000);
  expect(result.narxsiz).toBe(0);
});
