import { describe, expect, it } from 'vitest';
import { birlikOgohi, ongDaraja, qiymatBirlikOgohi } from './fakt-birlik-ogoh';

describe('ongDaraja — nisbat 10/100/1000 ga ±10%', () => {
  it('aniq va ±10% ichida', () => {
    expect(ongDaraja(10)).toBe(1);
    expect(ongDaraja(100)).toBe(2);
    expect(ongDaraja(1000)).toBe(3);
    expect(ongDaraja(107.5)).toBe(2);
    expect(ongDaraja(91)).toBe(2);
    expect(ongDaraja(1100)).toBe(3);
  });
  it('10% dan tashqarida, manfiy va noto‘g‘ri — null', () => {
    expect(ongDaraja(89)).toBeNull();
    expect(ongDaraja(112)).toBeNull();
    expect(ongDaraja(1)).toBeNull();
    expect(ongDaraja(50)).toBeNull();
    expect(ongDaraja(-100)).toBeNull();
    expect(ongDaraja(0)).toBeNull();
    expect(ongDaraja(Number.NaN)).toBeNull();
  });
});

describe('birlikOgohi — chegara va birlik taklifi', () => {
  it('haqiqiy holat: «100М3», smeta 2,791, kiritilgan 300 → taklif 3', () => {
    const o = birlikOgohi({ smeta: 2.791, joriy: 0, rejim: '+', n: 300, birlik: '100М3' })!;
    expect(o).not.toBeNull();
    expect(o.kopaytma).toBe(100);
    expect(o.birlikMatn).toBe('100 М3');
    expect(o.taklif).toBe(3);
    expect(o.gumon).toBe(true);
    expect(o.nisbat).toBeCloseTo(107.48, 1);
    expect(o.daraja).toBe(2);
  });

  it('chegara: 1,5 gacha ogoh yo‘q, 1,5 dan oshsa bor (jamlangan fakt bilan)', () => {
    expect(birlikOgohi({ smeta: 100, joriy: 0, rejim: '+', n: 150 })).toBeNull();
    expect(birlikOgohi({ smeta: 100, joriy: 0, rejim: '+', n: 150.01 })).not.toBeNull();
    expect(birlikOgohi({ smeta: 100, joriy: 100, rejim: '+', n: 50 })).toBeNull(); // 150 → chegarada
    expect(birlikOgohi({ smeta: 100, joriy: 100, rejim: '+', n: 60 })).not.toBeNull(); // joriy fakt bilan 160
    expect(birlikOgohi({ smeta: 100, joriy: 90, rejim: '=', n: 140 })).toBeNull(); // «=» — jami, joriy qo‘shilmaydi
  });

  it('smetadan oshish bloklanmaydi: 100% va 120% — ogoh yo‘q', () => {
    expect(birlikOgohi({ smeta: 50, joriy: 0, rejim: '=', n: 50 })).toBeNull();
    expect(birlikOgohi({ smeta: 50, joriy: 0, rejim: '=', n: 60 })).toBeNull();
  });

  it('daraja: kiritilgan hajm smetadan ~10 marta ko‘p, jamlangani kichik bo‘lsa ham', () => {
    // joriy manfiy (tuzatish) — jamlangan nisbat chegaradan past, lekin kiritilgan 10× ga teng
    const o = birlikOgohi({ smeta: 10, joriy: -95, rejim: '+', n: 100 });
    expect(o).not.toBeNull();
    expect(o!.daraja).toBe(1); // 100/10 = 10 → k=1
  });

  it('birlik ko‘paytmasiz: ogoh bor, taklif yo‘q', () => {
    for (const birlik of ['М3', 'Т', 'М3 ОСНОВАНИЯ', null, undefined]) {
      const o = birlikOgohi({ smeta: 3, joriy: 0, rejim: '+', n: 300, birlik })!;
      expect(o).not.toBeNull();
      expect(o.kopaytma).toBeNull();
      expect(o.taklif).toBeNull();
      expect(o.daraja).toBe(2);
    }
  });

  it('ko‘paytma bor, lekin oshish birlik xatosiga o‘xshamasa (1,8×) — ogoh bor, taklif yo‘q', () => {
    const o = birlikOgohi({ smeta: 10, joriy: 0, rejim: '+', n: 18, birlik: '100М3' })!;
    expect(o).not.toBeNull();
    expect(o.gumon).toBe(false);
    expect(o.taklif).toBeNull();
  });

  it('10 Т va 1000М3 ГРУНТА: taklif = kiritilgan / ko‘paytma', () => {
    expect(birlikOgohi({ smeta: 0.5, joriy: 0, rejim: '+', n: 5, birlik: '10 Т' })!.taklif).toBe(0.5);
    expect(birlikOgohi({ smeta: 1.2, joriy: 0, rejim: '=', n: 1200, birlik: '1000М3 ГРУНТА' })!.taklif).toBe(1.2);
  });

  it('minus qiymatlar: musbat smetaga minus fakt — ogoh yo‘q; chegirma (manfiy smeta) manfiy faktda ishora mos', () => {
    expect(birlikOgohi({ smeta: 100, joriy: 0, rejim: '+', n: -500 })).toBeNull();
    expect(birlikOgohi({ smeta: -100, joriy: 0, rejim: '=', n: -50 })).toBeNull();
    expect(birlikOgohi({ smeta: -100, joriy: 0, rejim: '=', n: -300 })).not.toBeNull();
    expect(birlikOgohi({ smeta: -100, joriy: 0, rejim: '=', n: 300 })).toBeNull();
  });

  it('NULL ≠ 0: smeta yo‘q yoki 0 bo‘lsa nisbat yo‘q — ogoh yo‘q; joriy fakt null — 0 deb olinadi, kiritilgan null — ogoh yo‘q', () => {
    expect(birlikOgohi({ smeta: null, joriy: 0, rejim: '+', n: 300, birlik: '100М3' })).toBeNull();
    expect(birlikOgohi({ smeta: undefined, joriy: 0, rejim: '+', n: 300 })).toBeNull();
    expect(birlikOgohi({ smeta: 0, joriy: 0, rejim: '+', n: 300 })).toBeNull();
    expect(birlikOgohi({ smeta: 3, joriy: 0, rejim: '+', n: null })).toBeNull();
    expect(birlikOgohi({ smeta: 3, joriy: null, rejim: '+', n: 300 })).not.toBeNull();
    expect(birlikOgohi({ smeta: Number.NaN, joriy: 0, rejim: '+', n: 300 })).toBeNull();
  });
});

describe('qiymatBirlikOgohi — matn kiritmasi', () => {
  it('«300» va vergulli «2,5»; foiz smetadan hisoblanadi', () => {
    expect(qiymatBirlikOgohi('300', '+', 2.791, 0, '100М3')!.taklif).toBe(3);
    expect(qiymatBirlikOgohi('2,5', '+', 2.791, 0, '100М3')).toBeNull();
    expect(qiymatBirlikOgohi('50%', '+', 2.791, 0, '100М3')).toBeNull();
    expect(qiymatBirlikOgohi('20000%', '=', 2.791, 0, '100М3')).not.toBeNull();
  });
  it('bo‘sh, noto‘g‘ri yoki smetasiz foiz — ogoh yo‘q', () => {
    expect(qiymatBirlikOgohi('', '+', 2.791, 0, '100М3')).toBeNull();
    expect(qiymatBirlikOgohi('abc', '+', 2.791, 0, '100М3')).toBeNull();
    expect(qiymatBirlikOgohi('50%', '+', null, 0, '100М3')).toBeNull();
  });
});
