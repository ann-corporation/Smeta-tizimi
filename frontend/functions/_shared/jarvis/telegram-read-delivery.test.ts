import { expect, it } from 'vitest';
import { telegramJarvisDelivery } from './telegram-read-delivery';

const guide = 'Davom etish uchun savolingizni yozing.';
it('keeps the existing short-answer and empty-answer shape', () => {
  expect(telegramJarvisDelivery('', guide)).toEqual({ matn: guide });
  expect(telegramJarvisDelivery('Narx: 0 so‘m. Narxsiz: —.', guide)).toEqual({ matn: guide + '\n\nNarx: 0 so‘m. Narxsiz: —.' });
});
it('delivers the end of a large source table instead of a silent excerpt', () => {
  const body = '| Obyekt | Narx | Manba |\n' + Array.from({ length: 200 }, (_, i) => `| Sinov ${i} | -7,25 so‘m | /admin/holat/${1000 + i} |\n`).join('') + 'OXIRGI MANBA';
  const result = telegramJarvisDelivery(body, guide);
  expect(result.matn).toBe(guide);
  expect(result.transcript!.join('')).toBe(body);
  expect(result.transcript!.at(-1)).toContain('OXIRGI MANBA');
  expect(result.transcript!.every(part => part.length <= 3500)).toBe(true);
  expect(result.transcript!.slice(0, -1).every(part => part.endsWith('\n'))).toBe(true);
});
it('keeps the final conversation guide at offset zero for its existing signed text_link entity', () => {
  const result = telegramJarvisDelivery('x'.repeat(9000), guide);
  expect(result.matn.slice(0, guide.length)).toBe(guide);
  expect(result.transcript!.join('')).toBe('x'.repeat(9000));
  expect(result.matn).not.toContain('x');
});
it.each([3499, 3500, 3501, 7000, 14001])('never loses a character at the %s boundary', size => {
  const body = 'x'.repeat(size);
  const result = telegramJarvisDelivery(body, guide);
  expect(result.transcript!.join('')).toBe(body);
  expect(result.transcript!.every(part => part.length > 0 && part.length <= 3500)).toBe(true);
});
it('does not split a surrogate pair or trim spaces and line separators', () => {
  const body = 'x'.repeat(3499) + '🏗️' + ' \r\n '.repeat(2200) + 'Yakun: 0; noma’lum: —; -7,25 so‘m';
  const result = telegramJarvisDelivery(body, guide);
  expect(result.transcript!.join('')).toBe(body);
  expect(result.transcript!.every(part => !/[\uD800-\uDBFF]$/.test(part) && !/^[\uDC00-\uDFFF]/.test(part))).toBe(true);
});
it('retains a long unbroken source URL and does not manufacture markup or actions', () => {
  const body = 'https://example.invalid/' + 'abc'.repeat(3000) + '?value=0#end';
  const result = telegramJarvisDelivery(body, guide);
  expect(result.transcript!.join('')).toBe(body);
  expect(Object.keys(result).sort()).toEqual(['matn', 'transcript']);
});
