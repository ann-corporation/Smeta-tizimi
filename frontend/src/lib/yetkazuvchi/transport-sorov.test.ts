import { describe, expect, it } from 'vitest';
import { transportSorovNomi, transportSorovTonna, transportSorovYoli } from './transport-sorov';

describe('transport-sorov', () => {
  it('tonna faqat hamma qator tonna bo\'lsa yig\'iladi', () => {
    expect(transportSorovTonna([{ nom: 'a', birlik: 'tonna', miqdor: 12.5 }, { nom: 'b', birlik: 'Tonna', miqdor: 7.5 }])).toBe(20);
    expect(transportSorovTonna([{ nom: 'a', birlik: 'tonna', miqdor: 2 }, { nom: 'b', birlik: 'm3', miqdor: 5 }])).toBeNull();
    expect(transportSorovTonna([])).toBeNull();
  });
  it('nom: ikkitagacha, qolgani +N', () => {
    expect(transportSorovNomi([{ nom: 'Sement', birlik: 't', miqdor: 1 }])).toBe('Sement');
    expect(transportSorovNomi(['A', 'B', 'C', 'D'].map((nom) => ({ nom, birlik: 'dona', miqdor: 1 })))).toBe('A, B +2');
  });
  it('havola: yangi=1, manzillar va buyurtma izohi', () => {
    const y = transportSorovYoli({ buyurtmaId: 9, qatorlar: [{ nom: 'Sement', birlik: 'tonna', miqdor: 20 }], olishManzil: 'Zavod ombori', yetkazishManzil: 'Navoiy, obyekt' });
    const u = new URL(y, 'https://x');
    expect(u.pathname).toBe('/admin/yuk-birjasi');
    expect(u.searchParams.get('yangi')).toBe('1');
    expect(u.searchParams.get('a')).toBe('Zavod ombori');
    expect(u.searchParams.get('b')).toBe('Navoiy, obyekt');
    expect(u.searchParams.get('tonna')).toBe('20');
    expect(u.searchParams.get('izoh')).toBe('Buyurtma #9');
  });
  it('manzil yo\'q bo\'lsa parametr qo\'shilmaydi', () => {
    const u = new URL(transportSorovYoli({ buyurtmaId: 1, qatorlar: [{ nom: 'X', birlik: 'dona', miqdor: 3 }] }), 'https://x');
    expect(u.searchParams.has('a')).toBe(false);
    expect(u.searchParams.has('tonna')).toBe(false);
  });
});
