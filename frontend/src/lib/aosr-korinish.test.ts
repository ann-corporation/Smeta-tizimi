import { describe, expect, it } from 'vitest';
import { aosrQoplama, protokolXulosa } from './aosr-korinish';

describe('aosrQoplama', () => {
  it('yashirin ishlar qoplamasi va imzolilar', () => {
    const r = aosrQoplama([
      { yashirin: true, akt_bor: true, akt_holat: 'tasdiqlangan' },
      { yashirin: true, akt_bor: true, akt_holat: 'yangi' },
      { yashirin: true, akt_bor: false },
      { yashirin: false, akt_bor: false },
    ]);
    expect(r).toMatchObject({ jami: 4, aktli: 2, yashirinJami: 3, yashirinAktli: 2, yashirinAktsiz: 1, yashirinImzoli: 1 });
    expect(r.yashirinUlush).toBeCloseTo(2 / 3);
    expect(r.umumiyUlush).toBe(0.5);
  });
  it('NULL ≠ 0: yashirin ish yo‘q — ulush null', () => {
    expect(aosrQoplama([{ yashirin: false, akt_bor: false }]).yashirinUlush).toBeNull();
    expect(aosrQoplama([]).umumiyUlush).toBeNull();
  });
});

describe('protokolXulosa', () => {
  it('natijalar va summa (summasiz alohida)', () => {
    expect(protokolXulosa([{ natija: 'mos', summa: 100 }, { natija: 'mos_emas', summa: null }, { natija: 'kutilmoqda', summa: '50' }]))
      .toEqual({ mos: 1, mosEmas: 1, kutilmoqda: 1, summa: 150, summasiz: 1 });
    expect(protokolXulosa([{ natija: 'mos', summa: null }]).summa).toBeNull();
  });
});
