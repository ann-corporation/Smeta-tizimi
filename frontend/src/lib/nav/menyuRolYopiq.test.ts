import { describe, expect, it } from 'vitest';
import { F2_YOZISH_CAPABILITY, menyuRolYopiq, rolCapabilityYopiq, rolF2YozishYopiq } from './menyuRolYopiq';

describe('menyuRolYopiq (egasi: buxgalter F2 ni faqat o‘qiydi)', () => {
  it('buxgalterga F2 import va tayyorlash sahifalari yopiq', () => {
    expect(menyuRolYopiq('bugalter', '/admin/f2')).toBe(true);
    expect(menyuRolYopiq('bugalter', '/admin/f2-tayyorlash')).toBe(true);
  });
  it('buxgalterga o‘qish tablari ochiq (tarix, reestr, nakopitelniy)', () => {
    for (const yol of ['/admin/f2-tarix', '/admin/f2-reestr', '/admin/nakopitelniy', '/admin/moliya']) expect(menyuRolYopiq('bugalter', yol)).toBe(false);
  });
  it('buxgalterga F2 yozish capability lari (import/prepare/approve/cancel/correct) yopiq, f2.read ochiq', () => {
    for (const c of F2_YOZISH_CAPABILITY) expect(rolCapabilityYopiq('bugalter', c)).toBe(true);
    expect(rolCapabilityYopiq('bugalter', 'f2.read')).toBe(false);
    expect(rolF2YozishYopiq('bugalter')).toBe(true);
  });
  it('boshqa rollarga ta’sir qilmaydi', () => {
    for (const rol of ['pto', 'prorab', 'boss', 'admin', undefined, null, '']) {
      expect(menyuRolYopiq(rol, '/admin/f2')).toBe(false);
      expect(rolCapabilityYopiq(rol, 'f2.approve')).toBe(false);
      expect(rolF2YozishYopiq(rol)).toBe(false);
    }
  });
});
