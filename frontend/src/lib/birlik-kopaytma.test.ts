import { describe, expect, it } from 'vitest';
import { birlikKopaytma } from './birlik-kopaytma';

describe('birlikKopaytma — birlikdagi ko‘paytma', () => {
  it.each([
    ['100М3', 100, '100 М3'],
    ['100 М3', 100, '100 М3'],
    ['100 М3 БЕТОНА', 100, '100 М3'],
    ['1000М3 ГРУНТА', 1000, '1000 М3'],
    ['1000 М3 ГРУНТА', 1000, '1000 М3'],
    ['100М2', 100, '100 М2'],
    ['10 Т', 10, '10 Т'],
    ['10Т', 10, '10 Т'],
    ['  100 м3  ', 100, '100 м3'],
    ['100M3', 100, '100 M3'],
    ['1 000 ШТ', 1000, '1000 ШТ'],
    ['100 ШТ.', 100, '100 ШТ'],
  ])('%s → ×%i', (kirish, kopaytma, matn) => {
    expect(birlikKopaytma(kirish)).toEqual({ kopaytma, birlik: matn });
  });

  it.each(['Т', 'М3', 'М3 ОСНОВАНИЯ', 'КГ', 'ШТ', '1М3', '1 Т', '3 КГ', '12 МЕС', '0,5 ГА', '2,5 Т', '100', '', '   ', '100,5М3'])(
    '«%s» — ko‘paytma yo‘q (null)', (kirish) => { expect(birlikKopaytma(kirish)).toBeNull(); });

  it('birlik yo‘q (null/undefined) — null, 0 emas', () => {
    expect(birlikKopaytma(null)).toBeNull();
    expect(birlikKopaytma(undefined)).toBeNull();
  });
});
