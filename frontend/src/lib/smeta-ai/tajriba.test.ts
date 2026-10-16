import { describe, expect, it } from 'vitest';
import { normaKalit, tajribaMatni, xotiraBloklari } from './tajriba';

describe('tizim tajribasi va xotira darajalari', () => {
  it('norma kaliti: kirill/lotin, faqat asosiy kod, Е310 = С310', () => {
    expect(normaKalit('Е310-1015 ШНК4.04.06-14 Р.3.Т.7 К=0,41')).toBe('C310-1015');
    expect(normaKalit('С310-1005')).toBe('C310-1005');
    expect(normaKalit('E1-2-5-1')).toBe('E1-2-5-1');
    expect(normaKalit('Е1-2-5-1')).toBe('E1-2-5-1');
    expect(normaKalit('без кода')).toBeNull();
  });
  it('tajriba matni: soni, obyekt, kompaniya va odatiy koeffitsient', () => {
    expect(tajribaMatni({ smeta_soni: 111, obyekt_soni: 15, kompaniya_soni: 3, studio_soni: 1, koeflar: [{ koef: 'КэМ=0,41', soni: 81 }, { koef: 'К=0,49', soni: 12 }, { koef: 'Кх=1,1', soni: 1 }] }))
      .toBe("112 marta qo'llangan (15 obyekt, 3 kompaniya); odatiy koeffitsient: КэМ=0,41 (81), К=0,49 (12)");
    expect(tajribaMatni({ smeta_soni: 0, obyekt_soni: 0, kompaniya_soni: 0, studio_soni: 0, koeflar: [] })).toBeNull();
  });
  it('uch daraja alohida bloklarda, ochirilgan yozuv chiqmaydi', () => {
    const b = xotiraBloklari({ tizim: [{ kalit: 'smeta.a', mazmun: 'tizim qoidasi' }], kompaniya: [{ kalit: 'smeta.b', mazmun: '-' }], foydalanuvchi: [{ kalit: 'smeta.c', mazmun: 'mening uslubim' }] });
    expect(b).toContain('<TIZIM XOTIRASI>\n- tizim qoidasi');
    expect(b).not.toContain('KOMPANIYA XOTIRASI');
    expect(b).toContain('<FOYDALANUVCHI XOTIRASI>\n- mening uslubim');
  });
});
