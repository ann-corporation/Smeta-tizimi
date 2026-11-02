import { describe, expect, it } from 'vitest';
import { oylikNuqtalar, yumaloqMax } from './nakopitelniy-grafik';

describe('nakopitelniy grafigi', () => {
  it('oylar bo‘yicha yig‘adi va jamlanma beradi; noma’lumni belgilaydi', () => {
    const q = new Map([[1, new Map([['2026-08', { hajm: 1, summa: 100 }], ['2026-09', { hajm: 1, summa: null }]])], [2, new Map([['2026-09', { hajm: 1, summa: 50 }]])]]);
    const r = oylikNuqtalar({ oylar: ['2026-08', '2026-09', '2026-10'], qiymat: q });
    expect(r.map((x) => [x.oy, x.summa, x.jamlanma, x.nomalum])).toEqual([['2026-08', 100, 100, false], ['2026-09', 50, 150, true], ['2026-10', 0, 150, false]]);
  });
  it('yumaloq maksimum', () => {
    expect(yumaloqMax(4_812_900_000)).toBe(5_000_000_000);
    expect(yumaloqMax(0)).toBe(1);
    expect(yumaloqMax(180)).toBe(200);
  });
});
