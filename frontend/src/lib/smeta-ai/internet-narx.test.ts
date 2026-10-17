import { describe, expect, it } from 'vitest';
import { belgilar, internetJavobiniTekshir, internetNarxi, qqsSiz, sahifaSonlari, sahifadaMahsulotBor, sahifadaNarxBor } from './internet-narx';

describe('internet narx agenti — da’volarni kod tekshiradi (egasi 2026-10-17)', () => {
  it('sahifadagi sonlar turli yozuvlarda o‘qiladi', () => {
    expect(sahifaSonlari('Цена: 1 250 000 сум, было 1.300.000; опт 1,200,000.50 и 980000')).toEqual(expect.arrayContaining([1_250_000, 1_300_000, 1_200_000.5, 980_000]));
    expect(sahifadaNarxBor('Арматура А500С 10 мм — 8 150 000 сум/тонна', 8_150_000)).toBe(true);
    expect(sahifadaNarxBor('Арматура А500С 10 мм — 8 150 000 сум/тонна', 8_400_000)).toBe(false);
  });
  it('mahsulot belgilari sahifada bo‘lishi shart (klass va diametr)', () => {
    expect(belgilar('Арматура А500С Д10')).toEqual(expect.arrayContaining(['А500С', '10']));
    expect(sahifadaMahsulotBor('Арматура A500C ф10мм, цена за тонну', 'Арматура А500С Д10')).toBe(true);
    expect(sahifadaMahsulotBor('Арматура A240 ф10мм', 'Арматура А500С Д10')).toBe(false);
    expect(sahifadaMahsulotBor('Арматура A500C ф12мм', 'Арматура А500С Д10')).toBe(false);
    expect(sahifadaMahsulotBor('Пескобетон сухая смесь, мешок', 'Пескобетон сухой')).toBe(true);
  });
  it('model javobi: faqat https, musbat narx, ≤3 manba, so‘ralgan id', () => {
    const m = internetJavobiniTekshir({ natijalar: [
      { id: 'r1', izoh: '', manbalar: [{ url: 'https://shop.uz/a', nom: 'x', narx: 100, birlik: 'т', nds: 'bilan', sotuvchi: 's' },
        { url: 'http://shop.uz/b', nom: 'x', narx: 100, birlik: 'т', nds: 'siz', sotuvchi: 's' }, { url: 'https://shop.uz/c', nom: 'x', narx: -1, birlik: 'т', nds: 'siz', sotuvchi: 's' }] },
      { id: 'begona', izoh: '', manbalar: [] }] }, [{ id: 'r1', nom: 'x', birlik: 'т', kat: 'МАТ' }]);
    expect(m.get('r1')?.davolar.map(d => d.url)).toEqual(['https://shop.uz/a']);
    expect(m.has('begona')).toBe(false);
  });
  it('narx doim QQSsiz; o‘rtacha faqat tekshirilgan manbalardan', () => {
    expect(qqsSiz({ narx: 112, nds: 'bilan' })).toBe(100);
    expect(qqsSiz({ narx: 112, nds: 'nomalum' })).toBe(100);
    expect(qqsSiz({ narx: 112, nds: 'siz' })).toBe(112);
    const b = { url: 'https://a.uz/x', nom: '', narx: 1, birlik: 'т', nds: 'siz' as const, sotuvchi: '', domen: 'a.uz', sabab: null, koef: 1 };
    expect(internetNarxi([{ ...b, tekshirildi: true, smetaNarx: 100 }, { ...b, tekshirildi: true, smetaNarx: 200 }, { ...b, tekshirildi: false, smetaNarx: 900 }])).toBe(150);
    expect(internetNarxi([{ ...b, tekshirildi: false, smetaNarx: 900 }])).toBeNull();
  });
});
