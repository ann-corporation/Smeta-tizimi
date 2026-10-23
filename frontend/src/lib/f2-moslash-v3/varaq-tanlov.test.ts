import { describe, expect, it } from 'vitest';
import { keyingiVaraq, manfiyVaraqmi, summaniOqi, varaqReestrMos } from './varaq-tanlov';

/** Sun'iy varaqlar (real fayl raqamlari emas): bitta faylda bir nechta akt varag'i, biri manfiy, biri kumulyativ. */
const v = (vsego: number | null, pryamye: number | null, ranee: number | null = null, qatorlarJami = 0) =>
  ({ jami: { vsego, pryamye, ranee, raznica: null, nds: null }, qatorlarJami });

describe('F2 varaq tanlovi — reestr summasi bo‘yicha', () => {
  it('ВСЕГО, ВСЕГО÷1,12, ИТОГО ПРЯМЫЕ va kumulyativ farq (±1 so‘m)', () => {
    expect(varaqReestrMos(v(1_120_000.4, 800_000), 1_120_000)).toBe('vsego');
    expect(varaqReestrMos(v(1_120_000, 800_000), 1_000_000)).toBe('vsego_qqssiz');
    expect(varaqReestrMos(v(1_120_000, 800_000), 800_000.9)).toBe('pryamye');
    expect(varaqReestrMos(v(3_360_000, 2_000_000, 2_240_000), 1_120_000)).toBe('kumulyativ');
    expect(varaqReestrMos(v(3_360_000, 2_000_000, 2_240_000), 1_000_000)).toBe('kumulyativ_qqssiz');
    expect(varaqReestrMos(v(1_120_000, 800_000), 1_120_002)).toBeNull();
    expect(varaqReestrMos(v(null, null), 5)).toBeNull();
    expect(varaqReestrMos(v(1, 1), 0)).toBeNull();
  });

  it('manfiy varaq belgisi', () => {
    expect(manfiyVaraqmi(v(-500, -400))).toBe(true);
    expect(manfiyVaraqmi(v(null, null, null, -3))).toBe(true);
    expect(manfiyVaraqmi(v(500, 400))).toBe(false);
  });

  it('summa matnini o‘qish', () => {
    expect(summaniOqi('24 143 466 271')).toBe(24_143_466_271);
    expect(summaniOqi('1 470 198 639,50')).toBe(1_470_198_639.5);
    expect(summaniOqi('12,345,678')).toBe(12_345_678);
    expect(summaniOqi('abc')).toBeNull();
  });

  it('keyingi kiritilmagan varaq', () => {
    expect(keyingiVaraq(4, 0, new Set([0, 1]))).toBe(2);
    expect(keyingiVaraq(4, 3, new Set([0, 3]))).toBe(1);
    expect(keyingiVaraq(2, 0, new Set([0, 1]))).toBeNull();
  });
});
