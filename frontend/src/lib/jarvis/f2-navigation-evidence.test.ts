import { expect, it } from 'vitest';
import { f2NavigationSelection } from './f2-navigation-evidence';
const row = (object: number, acts: number[]) => ({ tur: 'f2-reestr', id: object, akt_ids: acts });
const group = () => ({ tur: 'shartnoma-f2', truncated: false, total_objects: 2, obyektlar: [{ id: 3 }, { id: 4 }], sources: [row(3, []), row(4, [42])] });
it('preserves a unique exact act from the original single-object register', () => {
  expect(f2NavigationSelection(row(3, [41]))).toEqual({ obyekt: 3, akt: 41 });
  expect(f2NavigationSelection(row(3, []))).toBeNull();
  expect(f2NavigationSelection(row(3, [41, 42]))).toBeNull();
});
it('selects an act only after all objects in the contract have been checked', () => {
  const value = group(); const before = JSON.stringify(value);
  expect(f2NavigationSelection(value)).toEqual({ obyekt: 4, akt: 42 });
  expect(JSON.stringify(value)).toBe(before);
});
it('does not choose the first object when a contract has two matching acts', () => {
  expect(f2NavigationSelection({ ...group(), sources: [row(3, [41]), row(4, [42])] })).toBeNull();
});
it.each([
  { ...group(), truncated: true }, { ...group(), sources: [row(3, [41]), null] },
  { ...group(), total_objects: 3 }, { ...group(), sources: [row(3, []), row(99, [42])] },
  { ...group(), obyektlar: [{ id: 3 }, { id: 3 }] }, { ...group(), sources: [row(3, []), row(3, [41])] },
  row(0, [41]), row(3, [-1]), { tur: 'f2-reestr', id: '3', akt_ids: [41] }, null,
])('rejects incomplete, foreign or invalid evidence %#', value => expect(f2NavigationSelection(value)).toBeNull());
