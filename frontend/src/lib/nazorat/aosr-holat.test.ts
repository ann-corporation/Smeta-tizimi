import { describe, expect, it } from 'vitest';
import { aosrIshora, aosrYigindi } from './aosr-holat';

describe('aosr-holat', () => {
  it('holatlar', () => {
    expect(aosrIshora({ yashirin: false, akt_bor: false })).toBe('kerak_emas');
    expect(aosrIshora({ yashirin: true, akt_bor: false })).toBe('yoq');
    expect(aosrIshora({ yashirin: true, akt_bor: true, akt_holat: 'yangi' })).toBe('kutilmoqda');
    expect(aosrIshora({ yashirin: true, akt_bor: true, akt_holat: 'tasdiqlangan' })).toBe('imzolangan');
    expect(aosrIshora({ yashirin: true, akt_bor: true, akt_holat: 'qogoz' })).toBe('imzolangan');
  });
  it('holat noma\'lum bo\'lsa imzolangan deb faraz qilinmaydi', () => {
    expect(aosrIshora({ yashirin: true, akt_bor: true })).toBe('bor');
    expect(aosrIshora({ yashirin: true, akt_bor: true, akt_holat: null })).toBe('bor');
  });
  it('yig\'indi', () => {
    const s = aosrYigindi([{ yashirin: true, akt_bor: false }, { yashirin: true, akt_bor: true, akt_holat: 'yangi' }, { yashirin: false, akt_bor: false }]);
    expect(s).toMatchObject({ yoq: 1, kutilmoqda: 1, kerak_emas: 1, imzolangan: 0 });
  });
});
