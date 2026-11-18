import { describe, expect, it } from 'vitest';
import { narxBilanga, narxRejimMatndan, narxSizga, narxSoni } from './narx';

describe('narx QQS bilan/siz', () => {
  it('kanonik QQS siz = bilan / (1 + stavka), 2 xona; QQS bilan qaytadan', () => {
    expect(narxSizga(1120, 'bilan')).toBe(1000);
    expect(narxSizga(50000, 'bilan')).toBe(44642.86);
    expect(narxSizga(1000, 'siz')).toBe(1000);
    expect(narxBilanga(1000)).toBe(1120);
    expect(narxSizga(0, 'bilan')).toBeNull(); expect(narxSizga(null, 'siz')).toBeNull(); expect(narxSizga(-5, 'siz')).toBeNull();
  });
  it('matndan rejim: bilan / siz / aytilmagan (o\'zbek lotin, rus)', () => {
    expect(narxRejimMatndan('50 ming QQS bilan').rejim).toBe('bilan');
    expect(narxRejimMatndan('ndssiz 45 ming').rejim).toBe('siz');
    expect(narxRejimMatndan('qqs siz 45 ming').rejim).toBe('siz');
    expect(narxRejimMatndan('цена 1200 с НДС').rejim).toBe('bilan');
    expect(narxRejimMatndan('цена 1200 без НДС').rejim).toBe('siz');
    expect(narxRejimMatndan('narxi 1200').rejim).toBeNull();
    expect(narxRejimMatndan('50 ming QQS bilan').qolgan.trim()).toBe('50 ming');
  });
  it('«50 ming», «1,2 mln», «1 200 000»', () => {
    expect(narxSoni('50', 'ming')).toBe(50000); expect(narxSoni('1,2', 'mln')).toBe(1_200_000); expect(narxSoni('1 200 000')).toBe(1_200_000); expect(narxSoni('abc')).toBeNull();
  });
});
