import { describe, expect, it } from 'vitest';
import { summaPaket } from './summa-paket';
import { smetaJuftlik, smetaNisbat, smetaTengmi } from './smeta-jami';

const p = (qqsBilan: number, ustamasiz: number) => summaPaket({ qqs_bilan: qqsBilan, qqs: 0, ustamali: ustamasiz, ustamasiz, kesim: {}, soat: {} });

describe('smetaJuftlik / smetaTengmi', () => {
  it('teng (1 so‘m ichida) — bitta son', () => {
    expect(smetaTengmi(smetaJuftlik(p(1000, 800), p(1000.5, 800)))).toBe(true);
  });
  it('farqli — ikkalasi', () => {
    expect(smetaTengmi(smetaJuftlik(p(1000, 800), p(1500, 1200)))).toBe(false);
  });
  it('noma’lum (null) yoki yuklanmagan (undefined) — teng emas, 0 ga aylantirilmaydi', () => {
    expect(smetaTengmi(smetaJuftlik(p(1000, 800), null))).toBe(false);
    expect(smetaTengmi(smetaJuftlik(p(1000, 800)))).toBe(false);
    expect(smetaTengmi(smetaJuftlik(null, p(1000, 800)))).toBe(false);
  });
});

describe('smetaNisbat — asos asl smeta', () => {
  it('joriy ≠ asl: ikkala nisbat (651% o‘rniga 83% ham ko‘rinadi)', () => {
    const n = smetaNisbat(6511, 1000, 7810);
    expect(n.asl).toBe(651.1);
    expect(n.joriy).toBe(83.4);
    expect(n.ikkinchiBor).toBe(true);
  });
  it('joriy = asl: faqat asosiy nisbat', () => {
    const n = smetaNisbat(500, 1000, 1000);
    expect(n).toEqual({ asl: 50, joriy: null, ikkinchiBor: false });
  });
  it('asl noma’lum yoki 0 — null (0% emas)', () => {
    expect(smetaNisbat(500, null, 1000).asl).toBeNull();
    expect(smetaNisbat(500, 0, 1000).asl).toBeNull();
    expect(smetaNisbat(null, 1000, 1000).asl).toBeNull();
  });
});
