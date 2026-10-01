import { describe, expect, it } from 'vitest';
import { f2NarxTanla, f2Summa } from './f2-narx-taklif';

describe('F2 narx taklifi', () => {
  it('tartib: oldingi F2 → katalog → smeta; 0 va bo‘sh hisobga olinmaydi', () => {
    expect(f2NarxTanla({ f2Narx: 100, katalogNarx: 90, smetaNarx: 80 })).toEqual({ narx: 100, manba: 'oldingi_f2' });
    expect(f2NarxTanla({ f2Narx: 0, katalogNarx: 90, smetaNarx: 80 })).toEqual({ narx: 90, manba: 'katalog' });
    expect(f2NarxTanla({ f2Narx: null, katalogNarx: undefined, smetaNarx: 80 })).toEqual({ narx: 80, manba: 'smeta' });
    expect(f2NarxTanla({})).toBeNull();
  });

  it('summa Postgres bilan bir xil yaxlitlanadi', () => {
    expect(f2Summa(85.085, 29421)).toBe(2503285.79);
    expect(f2Summa(0.2, 11230766.3)).toBe(2246153.26);
  });
});
