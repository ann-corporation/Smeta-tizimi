import { describe, expect, it } from 'vitest';
import { sonSozBilan, summaSozBilan } from './propis';

describe('summa so‘z bilan (Форма № 3 «ИТОГО»)', () => {
  it('egasi namunasi: 7 620 061 020,12', () => {
    expect(summaSozBilan(7620061020.12)).toBe('Семь миллиардов шестьсот двадцать миллионов шестьдесят одна тысяча двадцать сум 12 тийин');
  });
  it('rasmiy blanka namunasi: 38 037 700,00 va ayol jinsi (тысячи)', () => {
    expect(summaSozBilan(38037700)).toBe('Тридцать восемь миллионов тридцать семь тысяч семьсот сум 00 тийин');
    expect(sonSozBilan(2001)).toBe('две тысячи один');
    expect(sonSozBilan(11_000)).toBe('одиннадцать тысяч');
    expect(sonSozBilan(0)).toBe('ноль');
  });
});
