import { afterEach, describe, expect, it } from 'vitest';
import { bosKiritma } from './f2-tayyor';
import { f2QatorniOlibTashla, f2SessiyaOqi, f2SessiyaSaqla, f2SessiyaTozala } from './f2-tayyor-sessiya';

afterEach(() => { sessionStorage.clear(); });

describe('F2 tayyorlash: saqlanmagan kiritmalar (sessionStorage)', () => {
  it('obyekt bo‘yicha saqlanadi va qaytadi (minus hajm ham)', () => {
    const k = { ...bosKiritma(), hajm: { 2: '-3', 5: '1,5' }, narx: { 5: '10' }, narxsiz: { 4: true } };
    f2SessiyaSaqla(8, { k, raqam: '12-С' });
    expect(f2SessiyaOqi(8)).toEqual({ k, raqam: '12-С' });
    expect(f2SessiyaOqi(9)).toBeNull(); // boshqa obyektga aralashmaydi
  });
  it('bo‘sh kiritma saqlanmaydi (eski yozuv ham o‘chadi)', () => {
    f2SessiyaSaqla(8, { k: { ...bosKiritma(), hajm: { 1: '2' } }, raqam: '' });
    f2SessiyaSaqla(8, { k: bosKiritma(), raqam: '' });
    expect(f2SessiyaOqi(8)).toBeNull();
  });
  it('buzilgan yozuv rad etiladi, tozalash ishlaydi', () => {
    sessionStorage.setItem('f2-tayyorlash:kiritma:8', '{"k":{"hajm":{"1":5}}}');
    expect(f2SessiyaOqi(8)).toBeNull();
    sessionStorage.setItem('f2-tayyorlash:kiritma:8', 'not json');
    expect(f2SessiyaOqi(8)).toBeNull();
    f2SessiyaSaqla(8, { k: { ...bosKiritma(), hajm: { 1: '2' } }, raqam: '' });
    f2SessiyaTozala(8);
    expect(f2SessiyaOqi(8)).toBeNull();
  });
  it('✕ faqat shu qatorni tozalaydi', () => {
    const k = { hajm: { 1: '2', 2: '3' }, narx: { 1: '5', 2: '6' }, summa: { 1: '10' }, narxsiz: { 1: true } };
    expect(f2QatorniOlibTashla(k, 1)).toEqual({ hajm: { 2: '3' }, narx: { 2: '6' }, summa: {}, narxsiz: {} });
  });
});
