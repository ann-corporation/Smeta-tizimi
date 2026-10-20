import { describe, expect, it } from 'vitest';
import { qidiruvMatni, qidiruvMoslagich, qidiruvNormal } from './qidiruv';

describe('F2 import qidiruvi', () => {
  it('2 belgidan kam — qidiruv yoqilmaydi', () => {
    expect(qidiruvMoslagich(' b ')).toBeNull();
  });
  it('so‘zlar istalgan tartibda, lotin/kirill tenglashtiriladi', () => {
    const mos = qidiruvMoslagich('b25 beton')!;
    expect(mos('БЕТОН ТЯЖЁЛЫЙ КЛАССА В25')).toBe(true);
    expect(mos('БЕТОН КЛАССА В15')).toBe(false);
    expect(qidiruvNormal('Ёлка  ab')).toBe('ЕЛКА АВ');
  });
  it('kod, nom va birlik bo‘yicha', () => {
    const q = { kod: 'E7-5-16-3', nom: 'Устройство покрытий', birlik: '100М2' };
    expect(qidiruvMoslagich('e7-5-16')!(qidiruvMatni(q))).toBe(true);
    expect(qidiruvMoslagich('100m2 pokr')!(qidiruvMatni(q))).toBe(true);
    expect(qidiruvMoslagich('100m3 pokr')!(qidiruvMatni(q))).toBe(false);
    expect(qidiruvMoslagich('100m2 покр')!(qidiruvMatni(q))).toBe(true);
  });
});
