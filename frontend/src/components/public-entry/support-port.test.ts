import { describe, expect, it } from 'vitest';
import { validateSupportSnapshot } from './support-port';

const receipt = { version: 1, mode: 'AI_ASSISTING', messages: [{ id: 'm', author: 'assistant', text: 'Salom' }] };
describe('Public support runtime receipt', () => {
  it.each([null, {}, { ...receipt, messages: undefined }, { ...receipt, version: NaN },
    { ...receipt, version: -1 }, { ...receipt, mode: 'UNKNOWN' },
    { ...receipt, messages: [null] }, { ...receipt, messages: [{ id: 'm', author: 'admin', text: 'x' }] },
    { ...receipt, messages: [{ id: 'm', author: 'assistant', text: {} }] },
    { ...receipt, messages: [...receipt.messages, ...receipt.messages] },
    { ...receipt, messages: [{ id: 'm', author: 'assistant', text: 'x'.repeat(20001) }] },
  ])('buzuq receiptni qabul qilmaydi: %j', value => {
    expect(validateSupportSnapshot(value)).toBeNull();
  });
  it('faqat ruxsat etilgan maydonlar va oxirgi 100 xabarni saqlaydi', () => {
    const result = validateSupportSnapshot({ ...receipt, secret: 'token', messages: Array.from({ length: 150 }, (_, i) => ({ id: `${i}`, author: 'visitor', text: `${i}`, internal: 'secret' })) });
    expect(result?.messages).toHaveLength(100);
    expect(result?.messages[0]).toEqual({ id: '50', author: 'visitor', text: '50' });
    expect(result).not.toHaveProperty('secret');
  });
});
