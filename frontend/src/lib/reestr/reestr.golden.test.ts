import { describe, it, expect } from 'vitest';
import { NAV_GURUHLAR } from '../nav/navReestr';
import fixture from './__fixtures__/nav-guruhlar.json';

describe('reestr -> NAV_GURUHLAR (golden)', () => {
  it('hosila NAV_GURUHLAR eski literal fixture bilan aynan teng', () => {
    expect(JSON.parse(JSON.stringify(NAV_GURUHLAR))).toEqual(fixture);
  });
  it('kalitlar tartibi ham bir xil (toEqual kalit tartibini tekshirmaydi)', () => {
    expect(JSON.stringify(NAV_GURUHLAR)).toBe(JSON.stringify(fixture));
  });
});
