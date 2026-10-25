import { describe, expect, it } from 'vitest';
import { menyuRolYopiq } from './menyuRolYopiq';

describe('menyuRolYopiq (egasi: buxgalter F2 import/tayyorlashni ko‘rmaydi)', () => {
  it('buxgalterga F2 import va tayyorlash yopiq', () => {
    expect(menyuRolYopiq('bugalter', '/admin/f2')).toBe(true);
    expect(menyuRolYopiq('bugalter', '/admin/f2-tayyorlash')).toBe(true);
  });
  it('buxgalterga o‘qish tablari ochiq (tarix, reestr, nakopitelniy)', () => {
    for (const yol of ['/admin/f2-tarix', '/admin/f2-reestr', '/admin/nakopitelniy', '/admin/moliya']) expect(menyuRolYopiq('bugalter', yol)).toBe(false);
  });
  it('boshqa rollarga ta’sir qilmaydi', () => {
    for (const rol of ['pto', 'prorab', 'boss', 'admin', undefined, null, '']) expect(menyuRolYopiq(rol, '/admin/f2')).toBe(false);
  });
});
