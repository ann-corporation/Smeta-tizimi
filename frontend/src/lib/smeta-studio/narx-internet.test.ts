import { describe, expect, it } from 'vitest';
import { justificationOf } from './commands';
import { internetAsosi, internetBuyruqlari } from './narx-internet';
import type { InternetManba, InternetNatija } from '../smeta-ai/internet-narx';

const m = (p: Partial<InternetManba>): InternetManba => ({ url: 'https://beton.uz/a', nom: 'Арматура A500C ф10', narx: 9_072_000, birlik: 'т', nds: 'bilan', sotuvchi: 'Beton.uz',
  domen: 'beton.uz', tekshirildi: true, sabab: null, smetaNarx: 8_100_000, koef: 1, ...p });

describe('internet narxi obosnovaniyasi (havolalar bilan)', () => {
  it('faqat tekshirilgan manbalar; havola, sotuvchi, sahifadagi narx va QQS hujjatda', () => {
    const n: InternetNatija = { id: 'r0', narx: 8_100_000, izoh: '', manbalar: [m({}), m({ url: 'https://x.uz/b', tekshirildi: false, sabab: 'sahifada bu narx topilmadi' })] };
    const j = internetAsosi(n, new Date('2026-10-17T10:00:00Z'))!;
    expect(j.docType).toBe('INTERNET');
    expect(j.document).toContain('17.10.2026');
    expect(j.document).toContain('÷ 1,12');
    expect(j.sources).toEqual([{ url: 'https://beton.uz/a', name: 'Beton.uz', price: '9072000', unit: 'т', vat: true }]);
    expect(justificationOf(j)?.sources).toHaveLength(1);
    const c = internetBuyruqlari([{ occurrenceId: 'o1', recipeId: 'r1' }], n);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ type: 'SET_PRICE', price: { value: '8100000', sourcePriceId: 'internet:beton.uz' } });
  });
  it('tekshirilgan manba yo‘q — narx qo‘yilmaydi; havolasiz INTERNET asosi rad etiladi', () => {
    expect(internetBuyruqlari([{ occurrenceId: 'o1', recipeId: 'r1' }], { id: 'r0', narx: null, izoh: '', manbalar: [m({ tekshirildi: false })] })).toEqual([]);
    expect(() => justificationOf({ docType: 'INTERNET', document: 'x', sourceName: null, sourceUnit: null, sourcePrice: null, conversion: null, reason: null })).toThrow('PRICE_JUSTIFICATION_INVALID');
    expect(() => justificationOf({ docType: 'INTERNET', document: 'x', sourceName: null, sourceUnit: null, sourcePrice: null, conversion: null, reason: null,
      sources: [{ url: 'http://a.uz', name: 'a', price: '1', unit: null, vat: null }] })).toThrow('PRICE_JUSTIFICATION_INVALID');
  });
});
