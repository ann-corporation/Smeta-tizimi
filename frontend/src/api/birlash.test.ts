import { describe, expect, it, vi } from 'vitest';
import { birlash } from './birlash';

describe('birlash: bir xil o‘qishni birlashtirish', () => {
  it('bir vaqtdagi bir xil kalit - bitta so‘rov', async () => {
    const f = vi.fn(async () => 7);
    const [a, b, c] = await Promise.all([birlash('k1', f), birlash('k1', f), birlash('k1', f)]);
    expect([a, b, c]).toEqual([7, 7, 7]);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('boshqa kalit - alohida so‘rov', async () => {
    const f = vi.fn(async () => 1);
    await Promise.all([birlash('k2', f), birlash('k3', f)]);
    expect(f).toHaveBeenCalledTimes(2);
  });
  it('xato darhol unutiladi - qayta urinish yangi so‘rov beradi', async () => {
    const f = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce(5);
    await expect(birlash('k4', f)).rejects.toThrow('x');
    await expect(birlash('k4', f)).resolves.toBe(5);
    expect(f).toHaveBeenCalledTimes(2);
  });
  it('grace tugagach - yangi so‘rov (tahrirdan keyingi o‘qish eski javob olmaydi)', async () => {
    const f = vi.fn(async () => 1);
    await birlash('k5', f, 5);
    await new Promise((r) => setTimeout(r, 20));
    await birlash('k5', f, 5);
    expect(f).toHaveBeenCalledTimes(2);
  });
});