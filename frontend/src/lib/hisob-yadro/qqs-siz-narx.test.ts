import { describe, expect, it } from 'vitest';
import { NDS_SUKUT_FOIZ, qqsSizNarx } from './nds';

describe('qqsSizNarx — QQS bilan narxdan QQS siz narx (yadro, tiyin aniqligida)', () => {
  it('sukut stavkada: 112 → 100; 1,12 → 1', () => {
    expect(qqsSizNarx(112, NDS_SUKUT_FOIZ)).toBe(100);
    expect(qqsSizNarx(1.12, NDS_SUKUT_FOIZ)).toBe(1);
  });
  it('boshqa stavka va tiyinga yaxlitlash', () => {
    expect(qqsSizNarx(115, 15)).toBe(100);
    expect(qqsSizNarx(10, NDS_SUKUT_FOIZ)).toBe(8.93);
  });
});
