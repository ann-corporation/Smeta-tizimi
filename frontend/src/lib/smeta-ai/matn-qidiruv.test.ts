import { describe, expect, it } from 'vitest';
import { MatnIndeks, ildiz, ildizlar } from './matn-qidiruv';
import { koefTakliflari, narxTanlovlariniTekshir, tanlovlarniTekshir, toplamKodi } from './protokol';

describe('BM25 ma’no qidiruvi — smeta va katalog nomlari boshqacha yozilganda', () => {
  const docs = ['УСТРОЙСТВО БЕТОННОЙ ПОДГОТОВКИ', 'УСТРОЙСТВО ЛЕНТОЧНЫХ ФУНДАМЕНТОВ ЖЕЛЕЗОБЕТОННЫХ ПРИ ШИРИНЕ ПОВЕРХУ ДО 1000 ММ',
    'РАЗБОРКА БЕТОННЫХ ФУНДАМЕНТОВ', 'Песок для строительных работ (природный) крупный, 2 класс, фр. 0-5 мм', 'Плиты облицовочные из травертина']
    .map((matn, id) => ({ id, matn }));
  const idx = new MatnIndeks(docs);
  it('so‘z shakli farq qilsa ham topadi', () => {
    expect(idx.qidir(['Бетонирование ленточного фундамента железобетонного'], 3)[0].id).toBe(1);
  });
  it('bosh amal mos kelgani yuqori turadi (устройство ≠ разборка)', () => {
    const r = idx.qidir(['Устройство бетонных фундаментов'], 3).map(x => x.id);
    expect(r.indexOf(1)).toBeLessThan(r.indexOf(2));
  });
  it('normativ resurs nomi katalog mahsulotini topadi', () => {
    expect(idx.qidir(['ПЕСОК ДЛЯ СТРОИТЕЛЬНЫХ РАБОТ ПРИРОДНЫЙ ОБОГАЩЕННЫЙ'], 1)[0]).toMatchObject({ id: 3 });
  });
  it('to‘xtash so‘zlari tashlanadi, sonlar aniq token', () => {
    expect(ildiz('для')).toBeNull();
    expect(ildizlar('фр. 0-5 мм')).toEqual(['фр', '0', '5']);
  });
});

describe('protokol: sbornik ishorasi, koeffitsient takliflari, qayta qidiruv va narx tanlovi', () => {
  it('toplam kodlari normallashadi', () => {
    expect(['Е06', 'E6', 'e-06', 'Сборник 6', 'xyz'].map(toplamKodi)).toEqual(['E06', 'E06', 'E06', 'E06', null]);
  });
  it('koeffitsient: asossiz, 1 ga teng yoki chegaradan tashqari — tashlanadi', () => {
    const r = koefTakliflari([{ nom: 'Tor sharoit', qiymat: '1,15', qollanish: 'ЧЕЛ+МАШ', asos: 'ShNQ texnik qism 3.1' }, { nom: 'x', qiymat: 1.2, asos: '' },
      { nom: 'y', qiymat: 1, asos: 'z' }, { nom: 'z', qiymat: 9, asos: 'z' }]);
    expect(r).toEqual([{ nom: 'Tor sharoit', qiymat: '1.15', qollanish: 'ЧЕЛ+МАШ', asos: 'ShNQ texnik qism 3.1' }]);
  });
  it('ish tanlovi: mos nomzod yo‘q bo‘lsa yangi qidiruv iboralari qaytadi', () => {
    const s = [{ id: 'w1', tavsif: 'x', birlik: 'м3' as const, material: null, nomzodlar: [{ id: 'a', kod: 'E6-1', nom: 'A', birlik: '100М3' }] }];
    expect(tanlovlarniTekshir({ tanlovlar: [{ id: 'w1', ishId: null, sabab: 'yo‘q', qidiruv: ['Устройство подготовки'] }] }, s)[0])
      .toMatchObject({ ishId: null, qidiruv: ['Устройство подготовки'] });
  });
  it('narx tanlovi faqat yuborilgan nomzod id sini qabul qiladi', () => {
    const s = [{ id: 'r0', nom: 'ПЕСОК', birlik: 'м3', kat: 'МАТ', nomzodlar: [{ id: 'k1', nom: 'Песок', birlik: 'м3', narx: 90000, manba: 'katalog' }] }];
    expect(narxTanlovlariniTekshir({ tanlovlar: [{ id: 'r0', tanlov: 'k1', ishonch: 'yuqori', sabab: 'mos' }] }, s)[0]).toMatchObject({ tanlov: 'k1', ishonch: 'yuqori' });
    expect(narxTanlovlariniTekshir({ tanlovlar: [{ id: 'r0', tanlov: 'k999', ishonch: 'yuqori', sabab: 'x', qidiruv: ['Песок мытый'] }] }, s)[0])
      .toMatchObject({ tanlov: null, ishonch: 'past', qidiruv: ['Песок мытый'] });
  });
});
