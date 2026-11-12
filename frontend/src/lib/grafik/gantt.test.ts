import { describe, expect, it } from 'vitest';
import { korinadiganlar, virtualOyna, QATOR_BALANDLIGI } from './gantt';
import type { GrafikQator } from './reja';

const q = (id: number, otaId: number | null): GrafikQator => ({ id, otaId, daraja: otaId ? 1 : 0, nom: 'n' + id, kod: null, oz: null, grafiksiz: false, summaOz: null, summaJami: null, narxsiz: 0,
  bosh: null, tugash: null, rejaFoiz: null, faktFoiz: null, faktBosh: null, faktTugash: null, holat: 'malumot_yoq', kechikishKun: 0, bolalar: 0 });

describe('gantt yordamchilari', () => {
  it('yopilgan ota ostidagi qatorlar yashiriladi (ichma-ich ham)', () => {
    const r = [q(1, null), q(2, 1), q(3, 2), q(4, null)];
    expect(korinadiganlar(r, new Set()).map((x) => x.id)).toEqual([1, 2, 3, 4]);
    expect(korinadiganlar(r, new Set([1])).map((x) => x.id)).toEqual([1, 4]);
    expect(korinadiganlar(r, new Set([2])).map((x) => x.id)).toEqual([1, 2, 4]);
  });
  it('virtual oyna 1700 qatordan faqat ko‘rinadiganini oladi', () => {
    const [a, b] = virtualOyna(0, 1700);
    expect(a).toBe(0);
    expect(b - a).toBeLessThan(60);
    const [c, d] = virtualOyna(800 * QATOR_BALANDLIGI, 1700);
    expect(c).toBeGreaterThan(700); expect(d).toBeLessThanOrEqual(1700);
    expect(virtualOyna(99999999, 10)[1]).toBe(10);
  });
});
