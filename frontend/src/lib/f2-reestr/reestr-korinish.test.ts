import { describe, expect, it } from 'vitest';
import { bajarilishMaxraji, manbaTaqsimot, reestrUlush } from './reestr-korinish';

const s = (malum: number, soni = 1, nomalum = 0) => ({ malum, soni, nomalum });

describe('F2 reestri ko‘rinishi — smeta = 100% ga nisbatan chiziq', () => {
  it('smeta noma’lum yoki 0 — foiz noma’lum, chiziq bo‘sh', () => {
    const p = { tasdiqlangan: s(10), tasdiqImport: s(10), tasdiqTizim: s(0, 0) };
    expect(reestrUlush(p, null).foiz).toBeNull();
    expect(reestrUlush(p, 0).foiz).toBeNull();
    expect(reestrUlush(p, undefined).importUlush).toBe(0);
  });
  it('import, tizim va aniqlanmagan manba bo‘laklari', () => {
    const r = reestrUlush({ tasdiqlangan: s(60), tasdiqImport: s(30), tasdiqTizim: s(20) }, 100);
    expect(r.foiz).toBe(60);
    expect(r.importUlush).toBeCloseTo(0.3);
    expect(r.tizimUlush).toBeCloseTo(0.2);
    expect(r.boshqaUlush).toBeCloseTo(0.1);
    expect(r.oshdi).toBe(false);
  });
  it('smetadan oshganda chiziq 100% da to‘xtaydi, oshdi belgisi qo‘yiladi', () => {
    const r = reestrUlush({ tasdiqlangan: s(150), tasdiqImport: s(80), tasdiqTizim: s(70) }, 100);
    expect(r.foiz).toBe(150);
    expect(r.importUlush + r.tizimUlush + r.boshqaUlush).toBeCloseTo(1);
    expect(r.tizimUlush).toBeCloseTo(0.2);
    expect(r.oshdi).toBe(true);
  });
  it('Stella kabi holat: asl smeta kichik, qo‘shimcha katta — maxraj smeta + o‘zgarishlar, foiz 100% dan oshmaydi', () => {
    const p = { tasdiqlangan: s(400), tasdiqImport: s(400), tasdiqTizim: s(0, 0) };
    const obyekt = { jami: 60, ozgarish: 420 };            // asl 60, qo'shimcha +420 → joriy 480
    expect(reestrUlush(p, obyekt.jami).foiz).toBeCloseTo(666.7, 1);       // eski xato: F2 / asl
    const m = bajarilishMaxraji(obyekt);
    expect(m).toEqual({ summa: 480, joriy: true });
    const r = reestrUlush(p, m.summa);
    expect(r.foiz).toBeCloseTo(83.3, 1);
    expect(r.oshdi).toBe(false);
    expect(r.importUlush + r.tizimUlush + r.boshqaUlush).toBeLessThanOrEqual(1);
  });
  it('maxraj: o‘zgarish noma’lum — asl smeta (joriy: false); asl noma’lum — null; manfiy o‘zgarish (bajarilmadi) kamaytiradi', () => {
    expect(bajarilishMaxraji({ jami: 100 })).toEqual({ summa: 100, joriy: false });
    expect(bajarilishMaxraji({ jami: 100, ozgarish: null })).toEqual({ summa: 100, joriy: false });
    expect(bajarilishMaxraji({ jami: null, ozgarish: 50 })).toEqual({ summa: null, joriy: false });
    expect(bajarilishMaxraji({ jami: 100, ozgarish: -30 })).toEqual({ summa: 70, joriy: true });
    expect(bajarilishMaxraji({ jami: 100, ozgarish: 0 })).toEqual({ summa: 100, joriy: true });
  });
  it('manba taqsimoti: aniqlanmagan qism alohida', () => {
    expect(manbaTaqsimot({ tasdiqlangan: s(100), tasdiqImport: s(50), tasdiqTizim: s(30) })).toEqual({ import: 50, tizim: 30, boshqa: 20, jami: 100 });
  });
});
