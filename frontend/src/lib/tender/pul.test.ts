import { describe, expect, it } from 'vitest';
import { pulJuft, qatorSumma, tejam, TENDER_QQS_SUKUT } from './pul';

describe('tender puli (QQS bilan asosiy)', () => {
  it('sukut stavka 12, yagona yadrodan', () => expect(TENDER_QQS_SUKUT).toBe(12));
  it('NDS siz → QQS bilan / QQS summasi', () => {
    expect(pulJuft(1000000, 12)).toEqual({ qqsBilan: 1120000, qqsSiz: 1000000, qqs: 120000, foiz: 12 });
    expect(pulJuft(1000000, 0)).toEqual({ qqsBilan: 1000000, qqsSiz: 1000000, qqs: 0, foiz: 0 });
  });
  it('noma\'lum — null, 0 emas', () => {
    expect(pulJuft(null, 12)).toEqual({ qqsBilan: null, qqsSiz: null, qqs: null, foiz: 12 });
    expect(pulJuft(500, null)).toEqual({ qqsBilan: null, qqsSiz: 500, qqs: null, foiz: null });
    expect(pulJuft(500, undefined).qqsBilan).toBeNull();
  });
  it('qator summasi va tejam', () => {
    expect(qatorSumma(10, 950000)).toBe(9500000);
    expect(qatorSumma(null, 5)).toBeNull();
    expect(tejam(50000000, 28560000)).toEqual({ summa: 21440000, foiz: 42.88 });
    expect(tejam(null, 1)).toBeNull();
    expect(tejam(10, null)).toBeNull();
    expect(tejam(1000, 1200)?.summa).toBe(-200);   // byudjetdan oshdi
  });
});
