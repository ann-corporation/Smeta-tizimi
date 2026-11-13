import { afterEach, describe, expect, it } from 'vitest';
import { holatdanQaytish, kutilayotganQaytish, QAYTISH_KALIT, QAYTISH_MUDDAT_MS, qaytishOlibTozalash, qaytishSaqla, xavfsizQaytish } from './qaytish';

afterEach(() => sessionStorage.clear());

describe('kirishdagi niyat (qaytish)', () => {
  it('faqat ichki nisbiy yo‘l qabul qilinadi', () => {
    expect(xavfsizQaytish('/admin/haydovchi')).toBe('/admin/haydovchi');
    expect(xavfsizQaytish('/admin/tender?id=7')).toBe('/admin/tender?id=7');
    expect(xavfsizQaytish('/bozor/e/12#izoh')).toBe('/bozor/e/12#izoh');
  });
  it.each([
    '//evil.example', '/\\evil.example', 'https://evil.example', 'http://evil.example/admin', 'javascript:alert(1)', 'admin/haydovchi',
    '/\t/evil.example', '/admin\n', '/admin\\..\\x', '/', '', ' /admin', null, undefined, 5, {}, ['/admin'], '/' + 'a'.repeat(600),
  ])('ochiq yo‘naltirish yo‘q: %j rad etiladi', (v) => {
    expect(xavfsizQaytish(v)).toBeNull();
  });
  it('location.state dan o‘qiydi; noto‘g‘ri holat — null', () => {
    expect(holatdanQaytish({ qaytish: '/admin/yuk-chaqirish' })).toBe('/admin/yuk-chaqirish');
    expect(holatdanQaytish({ qaytish: '//evil.example' })).toBeNull();
    expect(holatdanQaytish(null)).toBeNull();
    expect(holatdanQaytish('x')).toBeNull();
  });
  it('saqlanadi, bir marta olinadi va o‘chadi', () => {
    qaytishSaqla('/admin/haydovchi', 1000);
    expect(kutilayotganQaytish(2000)).toBe('/admin/haydovchi');
    expect(qaytishOlibTozalash(2000)).toBe('/admin/haydovchi');
    expect(qaytishOlibTozalash(2000)).toBeNull();
  });
  it('xavfli qiymat saqlanmaydi; qo‘lda buzilgan xotira ham rad etiladi', () => {
    qaytishSaqla('//evil.example');
    expect(sessionStorage.getItem(QAYTISH_KALIT)).toBeNull();
    sessionStorage.setItem(QAYTISH_KALIT, JSON.stringify({ yol: 'https://evil.example', vaqt: 1000 }));
    expect(kutilayotganQaytish(1500)).toBeNull();
    sessionStorage.setItem(QAYTISH_KALIT, '{buzuq');
    expect(kutilayotganQaytish(1500)).toBeNull();
  });
  it('eskirgan niyat ishlatilmaydi', () => {
    qaytishSaqla('/admin/haydovchi', 1000);
    expect(kutilayotganQaytish(1000 + QAYTISH_MUDDAT_MS + 1)).toBeNull();
    expect(sessionStorage.getItem(QAYTISH_KALIT)).toBeNull();
  });
});
