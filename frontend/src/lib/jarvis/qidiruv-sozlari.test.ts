import { describe, expect, it } from 'vitest';
import { qidiruvSozlari } from './qidiruv-sozlari';

describe('Jarvis aniq qidiruvi — savoldan obyekt va resurs so‘zlari (egasi 2026-10-15)', () => {
  it('«Amfiteatrda M200 beton smetada qanchadan berilgan?» → obyekt amfit, resurs БЕТОН + М200', () => {
    const s = qidiruvSozlari('Amfiteatrda M200 beton smetada qanchadan berilgan?');
    expect(s.resurs).toEqual(expect.arrayContaining(['БЕТОН', 'М200']));
    expect(s.obyekt).toContain('amfit');
    expect(s.resurs).not.toContain('СМЕТАДА');
  });
  it('o‘zbekcha qurilish so‘zlari qo‘shimchalari bilan ruscha atamaga', () => {
    expect(qidiruvSozlari('sementni narxi qancha')).toEqual(expect.objectContaining({ resurs: ['ЦЕМЕНТ'] }));
    expect(qidiruvSozlari("g'isht va armaturadan qancha bor").resurs).toEqual(expect.arrayContaining(['КИРПИЧ', 'АРМАТУР']));
    expect(qidiruvSozlari('A500C d12 armatura').resurs).toEqual(expect.arrayContaining(['А500С', 'Д12', 'АРМАТУР']));
  });
  it('ruscha savol ham ishlaydi; savol so‘zlari tashlanadi', () => {
    const s = qidiruvSozlari('Сколько стоит щебень фракции 5-20 на объекте Школа?');
    expect(s.resurs).toEqual(expect.arrayContaining(['ЩЕБЕНЬ']));
    expect(s.resurs).not.toContain('ОБЪЕКТ');
  });
  it('faqat harf/raqam — LIKE belgilari va bo‘sh savol xavfsiz', () => {
    const s = qidiruvSozlari('%_% \' ; drop');
    expect([...s.resurs, ...s.obyekt].every(w => /^[0-9a-zа-яёА-ЯЁA-Z]+$/i.test(w))).toBe(true);
    expect(qidiruvSozlari('')).toEqual({ obyekt: [], resurs: [] });
  });
});
