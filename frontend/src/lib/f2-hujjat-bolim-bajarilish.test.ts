import { describe, expect, it } from 'vitest';
import { bolimBajarilish, qatorBajarilish } from './f2-hujjat-korinish';
import { oylikJami } from './f2-reestr/reestr-korinish';

const n = (qator_id: number, daraja: number, tur: string, bolaSoni: number, soni: number) =>
  ({ qator_id, daraja, tur, kod: null, nom: `n${qator_id}`, bolaSoni, qatorlar: Array(soni).fill(0) });

describe('bolimBajarilish', () => {
  it('bo‘lim ishlari ulushining o‘rtachasi; smeta hajmi noma’lum ish hisobga kirmaydi', () => {
    const ier = [n(1, 0, 'rz', 3, 0), n(2, 1, 'bl', 0, 1), n(3, 1, 'bl', 0, 1), n(4, 1, 'bl', 0, 1), n(5, 0, 'rz', 1, 0), n(6, 1, 'bl', 0, 1)];
    const baj = new Map([[2, qatorBajarilish(10, 5, 5)], [3, qatorBajarilish(10, 0, 0)], [4, qatorBajarilish(null, 0, 3)], [6, qatorBajarilish(null, 0, 1)]]);
    const r = bolimBajarilish(ier, (id) => baj.get(id)!);
    expect(r).toHaveLength(2);
    expect(r[0].soni).toBe(2);
    expect(r[0].oldinUlush).toBeCloseTo(0.25);
    expect(r[0].shuUlush).toBeCloseTo(0.25);
    expect(r[0].foiz).toBeCloseTo(50);
    expect(r[1].foiz).toBeNull();
  });
});

describe('oylikJami', () => {
  it('oy va holat bo‘yicha; noma’lum summa 0 emas', () => {
    const r = oylikJami([
      { oy: '2026-09-01', hujjat_jami: 100, holat: 'tasdiqlangan' },
      { oy: '2026-09-15', hujjat_jami: 50, holat: 'qoralama' },
      { oy: '2026-08-01', hujjat_jami: null, holat: 'tasdiqlangan' },
    ]);
    expect(r.map((x) => x.oy)).toEqual(['2026-08', '2026-09']);
    expect(r[0].nomalumSoni).toBe(1);
    expect(r[0].tasdiqlangan).toBe(0);
    expect(r[1].tasdiqlangan).toBe(100);
    expect(r[1].jarayonda).toBe(50);
  });
});
