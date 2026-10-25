import { describe, expect, it } from 'vitest';
import { reestrTakrorlar, tuzatishAsli, type TakrorAkt } from './reestrTakror';

const a = (id: number, obyekt_id: number, raqam: string | null, hujjat_jami: number | null, holat = 'tasdiqlangan', oy = '2026-10-01'): TakrorAkt => ({ id, obyekt_id, oy, raqam, holat, hujjat_jami });

describe('reestrTakrorlar', () => {
  it('tuzatishAsli', () => {
    expect(tuzatishAsli('35-П')).toBe('35');
    expect(tuzatishAsli('35 - p')).toBe('35');
    expect(tuzatishAsli('35')).toBeNull();
    expect(tuzatishAsli(null)).toBeNull();
  });
  it('bir shartnomadagi turli obyektlarda bir xil raqam (№49 ×3) — bitta guruh; bekor akt kirmaydi', () => {
    const l = reestrTakrorlar([a(358, 163, '49', 1), a(362, 164, '49', 2, 'qoralama'), a(363, 165, '49', 3), a(9, 163, '49', 4, 'bekor')],
      new Map([[163, [26]], [164, [26]], [165, [26]]]));
    const g = l.filter((x) => x.tur === 'raqam');
    expect(g).toHaveLength(1);
    expect(g[0].aktlar.map((x) => x.id)).toEqual([358, 362, 363]);
  });
  it('shartnomasiz alohida obyektlarda bir xil raqam takror emas', () => {
    expect(reestrTakrorlar([a(1, 1, '5', 10), a(2, 2, '5', 20)], new Map()).filter((x) => x.tur === 'raqam')).toEqual([]);
  });
  it('bir obyektda bir xil summa (±0,5%) — summa guruhi', () => {
    const g = reestrTakrorlar([a(1, 7, '2', 227_280_682, 'tasdiqlangan', '2026-06-01'), a(2, 7, '35', 227_280_682, 'qoralama', '2026-05-01'), a(3, 7, '4', 500_000)], new Map())
      .filter((x) => x.tur === 'summa');
    expect(g).toHaveLength(1);
    expect(g[0].aktlar.map((x) => x.id)).toEqual([1, 2]);
  });
  it('tuzatish akti va asl akti juftlanadi; asl topilmasa belgilanadi; tuzatish raqam takrori emas', () => {
    const l = reestrTakrorlar([a(1, 1, '35', 1000), a(2, 1, '35-П', -1000), a(3, 1, '36-П', -5)], new Map());
    const tz = l.filter((x) => x.tur === 'tuzatish');
    expect(tz).toHaveLength(2);
    expect(tz.find((x) => x.kalit === '№35-П')!.aktlar.map((x) => x.id)).toEqual([2, 1]);
    expect(tz.find((x) => x.kalit === '№36-П')!.aslYoq).toBe(true);
    expect(l.filter((x) => x.tur === 'raqam')).toEqual([]);
  });
});