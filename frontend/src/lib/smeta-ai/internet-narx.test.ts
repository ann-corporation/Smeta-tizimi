import { describe, expect, it } from 'vitest';
import { belgilar, internetJavobiniTekshir, internetNarxi, internetXulosa, manbaKorsatma, manbaniBahola, qqsSiz, sahifaSonlari, sahifadaMahsulotBor, sahifadaNarxBor } from './internet-narx';

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

describe('internet narx: havola, sana, birlik hisobi (egasi 2026-11-16)', () => {
  const davo = { url: 'https://shop.uz/p/1', nom: 'Песок строительный, 1 м3', narx: 150000, birlik: 'т', nds: 'siz' as const, sotuvchi: 'Shop', sana: '2026-11-10' };
  const sorov = { id: 'r1', nom: 'ПЕСОК ДЛЯ СТРОИТЕЛЬНЫХ РАБОТ ПРИРОДНЫЙ', birlik: 'м3', kat: 'МАТ' };
  const sahifa = { ok: true as const, url: 'https://shop.uz/p/1', matn: 'Песок для строительных работ природный — 150 000 сум за тонну. ' };

  it('model sana: faqat YYYY-MM-DD, aks holda null', () => {
    const m = internetJavobiniTekshir({ natijalar: [{ id: 'r1', izoh: '', manbalar: [
      { ...davo, sana: '2026-11-10' }, { ...davo, url: 'https://shop.uz/p/2', sana: '10 ноября' }] }] }, [sorov]);
    expect(m.get('r1')?.davolar.map(d => d.sana)).toEqual(['2026-11-10', null]);
  });
  it('t narxi m3 ga: zichlik jadvaldan — hisob qatori va TAXMIN belgisi bilan', () => {
    const r = manbaniBahola(davo, sorov, 'shop.uz', sahifa, '2026-11-16');
    expect(r.smetaNarx).toBe(240000);
    expect(r.kalkulyatsiya?.join(' ')).toContain('1,6 t/m3');
    expect(r.taxmin?.join(' ')).toContain('zichlik taxmin qilindi');
    expect(r.topilgan).toBe('2026-11-16');
    // an assumption in the conversion never rates the result «yuqori»
    expect(internetXulosa([{ ...r, tekshirildi: true, ishonch: 'yuqori' }], ['shop.uz']).ishonch).toBe('orta');
  });
  it('zichlik noma‘lum mahsulot: hisoblanmaydi, sabab aytiladi', () => {
    const r = manbaniBahola({ ...davo, nom: 'Кирпич', narx: 900000 }, { ...sorov, nom: 'КИРПИЧ КЕРАМИЧЕСКИЙ', birlik: 'м3' }, 'shop.uz', sahifa, '2026-11-16');
    expect(r.smetaNarx).toBeNull();
    expect(r.tekshirildi).toBe(false);
    expect(r.sabab).toContain('zichlik');
  });
  it('100 м2 narxi m2 ga: aniq ko‘paytuvchi, taxmin belgisi bilan', () => {
    const r = manbaniBahola({ ...davo, narx: 1200000, birlik: '100 м2' }, { id: 'r2', nom: 'ЛИНОЛЕУМ', birlik: 'м2', kat: 'МАТ' }, 'shop.uz',
      { ok: true, url: davo.url, matn: 'Линолеум — 1 200 000 сум' }, '2026-11-16');
    expect(r.smetaNarx).toBe(12000);
    expect(r.taxmin?.length).toBe(1);
  });
  it('havolasiz manba narx emas: ko‘rsatilmaydi va o‘rtachaga kirmaydi', () => {
    const r = manbaniBahola({ ...davo, url: 'shop.uz/p/1' }, sorov, 'shop.uz', sahifa, '2026-11-16');
    expect(r.tekshirildi).toBe(false);
    expect(manbaKorsatma(r)).toBeNull();
    expect(internetNarxi([{ ...r, tekshirildi: true, smetaNarx: 999 }])).toBeNull();
  });
  it('ko‘rsatma: sarlavha, havola, sana, topilgan narx QQS holati bilan va hisob', () => {
    const r = manbaniBahola({ ...davo, nds: 'bilan', narx: 168000, birlik: 'т' }, { ...sorov, birlik: 'кг', nom: 'ПЕСОК', kat: 'МАТ' }, 'shop.uz', { ok: true, url: davo.url, matn: 'Песок 168 000 сум' }, '2026-11-16');
    const k = manbaKorsatma(r)!;
    expect(k.url).toBe('https://shop.uz/p/1');
    expect(k.sarlavha).toContain('Песок');
    expect(k.sana).toBe('2026-11-10');
    expect(k.topilganNarx).toBe("168 000 so'm/т (QQS bilan)");
    expect(k.smetaNarx).toBe(150);
    expect(k.kalkulyatsiya.join(' ')).toContain('÷ 1,12');
  });
});
