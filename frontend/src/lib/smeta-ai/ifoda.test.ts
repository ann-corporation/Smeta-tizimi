import { describe, expect, it } from 'vitest';
import { ifodaHisobla } from './ifoda';

describe('safe quantity formula', () => {
  it.each([
    ['12*0,6*0,1', '0.72'], ['(6+4)×2×0.5', '10'], ['3 x 4 x 0.2', '2.4'], ['0.1+0.2', '0.3'],
    ['2 * (12 + 8) * 0,3 * 1,2', '14.4'], ['10/3', '3.333333'], ['1 250 * 2', '2500'], ['24', '24'],
  ])('%s = %s', (src, v) => expect(ifodaHisobla(src).qiymat).toBe(v));
  it('shows the formula with × for the user', () => expect(ifodaHisobla('12*0,6*0,1').ifoda).toBe('12 × 0,6 × 0,1'));
  it.each(['alert(1)', '2**3', '1/0', '()', '', '5-10', 'Math.PI', '2;3'])('rejects %s', src => expect(() => ifodaHisobla(src)).toThrow());
});
