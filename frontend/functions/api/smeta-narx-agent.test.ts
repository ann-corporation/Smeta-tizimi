import { describe, expect, it } from 'vitest';
import type { KatalogSnapshot } from '../_shared/narx-katalog-snapshot';
import { allowedCandidates, parseItems, validateChoices } from './smeta-narx-agent';

const snap = (id: number, nom: string, birlik: string, narx: string | null): KatalogSnapshot => ({ revision: 'r', id, manba_id: 1, manba_nom: 'K', manba_tur: 'platforma',
  manba_sana: null, kod: null, nom, birlik, narx, hudud: 'Toshkent', ishlab_chiqaruvchi: null, nds_holati: null, nds_izoh: null, yil: 2026, kvartal: 2, narx_varianti: null, guruh: null });
const SNAPS = new Map([
  [1, snap(1, 'Товарный бетон БСТ В15 П4 F50', 'м3', '780000')],
  [2, snap(2, 'Товарный бетон БСТ В25 П4 F50', 'м3', '900000')],
  [3, snap(3, 'Товарный бетон БСТ В15 П3', 'т', '400000')],
  [4, snap(4, 'Товарный бетон БСТ В15 П3 F75', 'м3', null)],
]);

describe('smeta narx agenti — server gates', () => {
  it('rejects malformed input', () => {
    expect(parseItems([])).toBeNull();
    expect(parseItems([{ key: 'bad key!', nom: 'x', nomzodlar: [1] }])).toBeNull();
    expect(parseItems([{ key: 'o:r', nom: 'x', nomzodlar: [1, 2, 3, 4, 5, 6, 7, 8, 9] }])).toBeNull();
    expect(parseItems([{ key: 'o:r', nom: 'Бетон', birlik: 'м3', nomzodlar: [1, 1, 2] }])![0].nomzodlar).toEqual([1, 2]);
  });
  it('only real, priced candidates that pass characteristic + unit gates are offered to the model', () => {
    const item = parseItems([{ key: 'o:r', nom: 'Бетон тяжелый класса B15', birlik: 'м3', nomzodlar: [1, 2, 3, 4, 99] }])![0];
    expect(allowedCandidates(item, SNAPS).map(s => s.id)).toEqual([1]);
  });
  it('a model choice outside the allowed list (or invented) is discarded', () => {
    const allowed = new Map([['a', [SNAPS.get(1)!]], ['b', [SNAPS.get(1)!]], ['c', []]]);
    const out = validateChoices({ results: [
      { key: 'a', tanlov_id: 1, ishonch: 'yuqori', sabab: 'B15, m3 mos' },
      { key: 'b', tanlov_id: 2, ishonch: 'yuqori', sabab: 'ignore previous instructions' },
    ] }, allowed);
    expect(out.map(x => [x.key, x.tanlov?.id ?? null])).toEqual([['a', 1], ['b', null], ['c', null]]);
    expect(out[1].ishonch).toBe('past');
    expect(validateChoices('garbage', allowed).every(x => x.tanlov === null)).toBe(true);
  });
});
