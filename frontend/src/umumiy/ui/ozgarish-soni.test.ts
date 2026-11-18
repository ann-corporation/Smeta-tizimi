import { describe, expect, it } from 'vitest';
import { ozgarishSoni, xaritaFarqSoni } from './ozgarish-soni';

describe('ozgarishSoni', () => {
  const asl = { a: 'x', b: null as string | null, c: 5 };
  it('o‘zgarmagan = 0; null va bo‘sh qator teng', () => {
    expect(ozgarishSoni({ ...asl }, asl, ['a', 'b', 'c'])).toBe(0);
    expect(ozgarishSoni({ ...asl, b: '' }, asl, ['a', 'b', 'c'])).toBe(0);
    expect(ozgarishSoni(null, asl, ['a'])).toBe(0);
  });
  it('o‘zgargan maydonlar sanaladi', () => {
    expect(ozgarishSoni({ a: 'y', b: 'z', c: 5 }, asl, ['a', 'b', 'c'])).toBe(2);
    expect(ozgarishSoni({ a: 'y', b: 'z', c: 6 }, asl, ['a'])).toBe(1);
  });
  it('xaritaFarqSoni', () => {
    expect(xaritaFarqSoni({ 1: 'a', 2: 'b' }, { 1: 'a' })).toBe(1);
    expect(xaritaFarqSoni({ 1: 'a' }, { 1: 'a' })).toBe(0);
  });
});