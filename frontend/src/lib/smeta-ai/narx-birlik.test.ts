import { describe, expect, it } from 'vitest';
import { birlikNormKalit, narxBirlikKoef } from './narx-birlik';
import { priceUnitFactor } from '../smeta-studio/resource-match';

const k = (a: string | null, b: string | null, q?: { miqdor: number; birlik: string }) => narxBirlikKoef(a, b, q).koef;

describe('narx birligini smeta birligiga o‘tkazish — yagona sof funksiya', () => {
  it('birlik yozuvlari bir kalitga keladi (rus, o‘zbek lotin, qisqartma)', () => {
    expect(birlikNormKalit('т.')).toBe('Т');
    expect(birlikNormKalit('м³')).toBe('М3');
    expect(birlikNormKalit('п.м')).toBe('ПМ');
    expect(birlikNormKalit('10 шт')).toBe('10ШТ');
    expect(birlikNormKalit('kg')).toBe('КГ');
    expect(birlikNormKalit('dona')).toBe('ДОНА');
    expect(birlikNormKalit('куб. метр')).toBe('М3');
    expect(birlikNormKalit("so'm/kubometr")).toBe('М3');
    expect(birlikNormKalit('сум/т')).toBe('Т');
    expect(birlikNormKalit('за тонну')).toBe('Т');
  });
  it('massa, uzunlik, yuza, hajm, dona — aniq ko‘paytuvchi', () => {
    expect(k('кг', 'т')).toBe(1000);
    expect(k('т', 'кг')).toBe(0.001);
    expect(k('м', 'п.м')).toBe(1);
    expect(k('м', '1000 м')).toBe(1000);
    expect(k('м', '10м')).toBe(10);
    expect(k('шт', '100 шт')).toBe(100);
    expect(k('шт', '1000ШТ')).toBe(1000);
    expect(k('тыс. шт', 'шт')).toBe(0.001);
    expect(k('dona', 'ШТ')).toBe(1);
    expect(k('куб. метр', 'М3')).toBe(1);
    expect(k('л', 'м3')).toBe(1000);
    expect(k('кг', '100 кг')).toBe(100);
    expect(k('м2', '10 м2')).toBe(10);
  });
  it('qadoq faqat tarkibi bilan: мешок 50 кг → т, лист 3 м2 → м2, profil 3 м → м', () => {
    expect(k('мешок', 'т', { miqdor: 50, birlik: 'кг' })).toBe(20);
    expect(k('лист', 'м2', { miqdor: 3, birlik: 'м2' })).toBeCloseTo(1 / 3, 10);
    expect(k('шт', 'м', { miqdor: 3, birlik: 'м' })).toBeCloseTo(1 / 3, 10);
    expect(k('qop', 'т', { miqdor: 25, birlik: 'kg' })).toBe(40);
    expect(narxBirlikKoef('мешок', 'т')).toMatchObject({ koef: null, sabab: expect.stringContaining('qadoq') });
  });
  it('o‘tkazib bo‘lmaydigan birlik rad etiladi (taxmin yo‘q)', () => {
    expect(k('т', 'м3')).toBeNull();
    expect(k('шт', 'компл')).toBeNull();
    expect(k('сум', 'т')).toBeNull();
    expect(k(null, 'т')).toBeNull();
    expect(k('маш.-ч', 'ч')).toBeNull();
    // A count in the source unit may be a coil/package ("100 м") — only estimate-side multiples are exact.
    expect(k('100 м', 'м')).toBeNull();
    // A stated package content of another dimension does not turn kg into m3.
    expect(k('мешок', 'м3', { miqdor: 50, birlik: 'кг' })).toBeNull();
  });
  it('katalog moslash ham shu funksiyaga tayanadi (oldingi qiymatlar saqlanadi)', () => {
    expect(priceUnitFactor('шт', '1000 шт')).toBe(1000);
    expect(priceUnitFactor('тыс. шт', 'шт')).toBe(0.001);
    expect(priceUnitFactor('т', 'кг')).toBe(0.001);
    expect(priceUnitFactor('т', 'т')).toBe(1);
    expect(priceUnitFactor('т', 'м3')).toBeNull();
  });
});
