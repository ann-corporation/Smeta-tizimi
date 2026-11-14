import { describe, expect, it } from 'vitest';
import { bajarilishFoizi, birlikShakli, narxFarqi, pulBilanYopiladi, pulBirligimi } from './pul-bilan-yopiladi';

describe('pulBilanYopiladi — birlik pul VA narx = 1', () => {
  it.each(['сум', 'СУМ', 'сўм', 'so\'m', 'so‘m', 'soʻm', 'so’m', ' Sum ', 'UZS', 'сум.'])('birlik варианти %s taniladi', (b) => {
    expect(pulBilanYopiladi(b, 1)).toBe(true);
  });
  it('narx 1 emas — pul qatori emas (narx 2, 0.5, 40)', () => {
    for (const n of [2, 0.5, 40, 0]) expect(pulBilanYopiladi('сум', n)).toBe(false);
  });
  it('NULL / noma’lum: narx yo‘q yoki birlik yo‘q — emas', () => {
    expect(pulBilanYopiladi('сум', null)).toBe(false);
    expect(pulBilanYopiladi('сум', undefined)).toBe(false);
    expect(pulBilanYopiladi('сум', '')).toBe(false);
    expect(pulBilanYopiladi('сум', Number.NaN)).toBe(false);
    expect(pulBilanYopiladi(null, 1)).toBe(false);
    expect(pulBilanYopiladi(undefined, 1)).toBe(false);
  });
  it('jismoniy birlik narx 1 bo‘lsa ham pul emas', () => {
    expect(pulBilanYopiladi('м3', 1)).toBe(false);
    expect(pulBilanYopiladi('шт', '1')).toBe(false);
  });
  it('narx matn ko‘rinishida kelsa (numeric) ham ishlaydi', () => {
    expect(pulBilanYopiladi('сум', '1')).toBe(true);
    expect(pulBilanYopiladi('сум', '1.00')).toBe(true);
  });
  it('yordamchilar', () => {
    expect(birlikShakli(' So\'M. ')).toBe('som');
    expect(pulBirligimi('кг')).toBe(false);
  });
});

describe('narxFarqi — pul qatorida «qo‘llanmaydi» (null), hech qachon 0', () => {
  it('pul qatori: haqiqiy va bazaviy bo‘lsa ham null (absurd 1e20 ga qaramay)', () => {
    expect(narxFarqi({ birlik: 'сум', narx: 1 }, 1_000_000, 1e20)).toBeNull();
    expect(narxFarqi({ birlik: 'сум', narx: 1 }, 5, 5)).toBeNull();
  });
  it('oddiy qator: oddiy ayirma; teng bo‘lsa 0 (haqiqiy nol)', () => {
    expect(narxFarqi({ birlik: 'м3', narx: 100 }, 1000, 900)).toBe(100);
    expect(narxFarqi({ birlik: 'м3', narx: 100 }, 900, 900)).toBe(0);
  });
  it('qiymat noma’lum — null (0 emas)', () => {
    expect(narxFarqi({ birlik: 'м3', narx: 100 }, null, 900)).toBeNull();
    expect(narxFarqi({ birlik: 'м3', narx: 100 }, 900, undefined)).toBeNull();
  });
});

describe('bajarilishFoizi — pul qatorida yopilgan pul foizi', () => {
  it('pul qatori: summa bo‘yicha (hajm = pul)', () => {
    expect(bajarilishFoizi({ birlik: 'сум', narx: 1, hajm: 1_000_000, summa: 1_000_000 }, 400_000, 400_000)).toBe(40);
  });
  it('oddiy qator: hajm bo‘yicha', () => {
    expect(bajarilishFoizi({ birlik: 'м3', narx: 100, hajm: 10, summa: 1000 }, 5, 500)).toBe(50);
  });
  it('maxraj 0 yoki noma’lum — null', () => {
    expect(bajarilishFoizi({ birlik: 'сум', narx: 1, hajm: 0, summa: 0 }, 1, 1)).toBeNull();
    expect(bajarilishFoizi({ birlik: 'м3', narx: 100, hajm: null }, 1, 1)).toBeNull();
  });
});
