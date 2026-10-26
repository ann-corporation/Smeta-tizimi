import { describe, expect, it } from 'vitest';
import { foizOl, ikkiTomon, smetaTaqsimot, yashirinIdlar } from './nakopitelniy-korinish';

describe('foizOl', () => {
  it('noma’lum yoki nol asos — null, 0 emas', () => {
    expect(foizOl(5, null)).toBeNull();
    expect(foizOl(null, 10)).toBeNull();
    expect(foizOl(5, 0)).toBeNull();
    expect(foizOl(Number.NaN, 10)).toBeNull();
    expect(foizOl(0, 10)).toBe(0);
    expect(foizOl(25, 200)).toBe(13);
  });
});

describe('smetaTaqsimot', () => {
  it('smeta noma’lum — null', () => {
    expect(smetaTaqsimot({ smeta: null, oldingi: 1, joriy: 1, fakt: 1 })).toBeNull();
    expect(smetaTaqsimot({ smeta: 0, oldingi: 1, joriy: 1, fakt: 1 })).toBeNull();
  });
  it('ulushlar yig‘indisi 100% (oshmasa)', () => {
    const r = smetaTaqsimot({ smeta: 1000, oldingi: 200, joriy: 100, fakt: 500 })!;
    expect(r.oldingi).toBeCloseTo(20); expect(r.joriy).toBeCloseTo(10);
    expect(r.faktQoldi).toBeCloseTo(20); expect(r.qolgan).toBeCloseTo(50);
    expect(r.oldingi + r.joriy + r.faktQoldi + r.qolgan).toBeCloseTo(100);
    expect(r.oshdi).toBe(false); expect(r.foiz).toBeCloseTo(30);
  });
  it('F2 smetadan oshsa — oshdi va o‘lchov kattalashadi', () => {
    const r = smetaTaqsimot({ smeta: 1000, oldingi: 900, joriy: 300, fakt: 1200 })!;
    expect(r.oshdi).toBe(true);
    expect(r.oldingi + r.joriy + r.faktQoldi + r.qolgan).toBeCloseTo(100);
    expect(r.foiz).toBeCloseTo(120);
  });
});

describe('ikkiTomon', () => {
  it('bitta o‘lchovda, 100% dan oshmaydi', () => {
    expect(ikkiTomon(50, 100, 200)).toEqual({ chap: 50, ong: 25 });
    expect(ikkiTomon(500, null, 200)).toEqual({ chap: 0, ong: 100 });
    expect(ikkiTomon(5, 5, 0)).toEqual({ chap: 0, ong: 0 });
  });
});

describe('yashirinIdlar', () => {
  const q = [
    { qator_id: 1, ota_id: null }, { qator_id: 2, ota_id: 1 }, { qator_id: 3, ota_id: 2 },
    { qator_id: 4, ota_id: null }, { qator_id: 5, ota_id: 4 },
  ];
  it('yig‘ilgan bo‘lim ostidagi hamma avlod yashiriladi, bo‘limning o‘zi emas', () => {
    expect([...yashirinIdlar(q, new Set([1]))].sort()).toEqual([2, 3]);
    expect([...yashirinIdlar(q, new Set([2]))]).toEqual([3]);
    expect(yashirinIdlar(q, new Set()).size).toBe(0);
  });
  it('tsiklda cheksiz aylanmaydi', () => {
    const c = [{ qator_id: 1, ota_id: 2 }, { qator_id: 2, ota_id: 1 }];
    expect(() => yashirinIdlar(c, new Set([1]))).not.toThrow();
  });
});
