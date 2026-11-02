import { describe, expect, it } from 'vitest';
import { manbaTaqsimot, reestrUlush } from './reestr-korinish';

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
  it('manba taqsimoti: aniqlanmagan qism alohida', () => {
    expect(manbaTaqsimot({ tasdiqlangan: s(100), tasdiqImport: s(50), tasdiqTizim: s(30) })).toEqual({ import: 50, tizim: 30, boshqa: 20, jami: 100 });
  });
});
