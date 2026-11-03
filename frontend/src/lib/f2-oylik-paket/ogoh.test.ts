import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ topshirilganPaketlar: vi.fn(), toast: vi.fn() }));
vi.mock('../../api/t2-shartnoma-oylik-paket', () => ({ topshirilganPaketlar: m.topshirilganPaketlar }));
vi.mock('../../umumiy/ui/Toast', () => ({ toast: m.toast }));

import { paketOgohMatni, paketSanasi, topshirilganPaketOgohi } from './ogoh';

beforeEach(() => { m.topshirilganPaketlar.mockReset(); m.toast.mockReset(); });
afterEach(() => vi.useRealTimers());

describe('topshirilgan paket ogohlantirishi', () => {
  it('matn: versiya va sana (Toshkent), bir shartnoma', () => {
    expect(paketSanasi('2026-11-03T10:00:00Z')).toBe('03.11.2026');
    expect(paketOgohMatni([{ shartnoma_id: 1, shartnoma_raqam: 'T-1', versiya: 2, vaqt: '2026-11-03T10:00:00Z' }]))
      .toBe('Bu oy paketi topshirilgan (v2, 03.11.2026). O‘zgarish paketga kirmaydi — yangi versiya kerak bo‘ladi.');
  });
  it('paket bor — warn toast chiqadi, funksiya qaytadi (saqlash to‘smaydi)', async () => {
    m.topshirilganPaketlar.mockResolvedValue([{ shartnoma_id: 1, shartnoma_raqam: 'T-1', versiya: 1, vaqt: '2026-11-03T10:00:00Z' }]);
    const r = await topshirilganPaketOgohi(5, '2026-03-15');
    expect(r).toContain('v1');
    expect(m.toast).toHaveBeenCalledWith(expect.stringContaining('topshirilgan'), 'warn', undefined, 9000);
    expect(m.topshirilganPaketlar).toHaveBeenCalledWith(5, '2026-03-15');
  });
  it('paket yo‘q yoki oy yo‘q — jim', async () => {
    m.topshirilganPaketlar.mockResolvedValue([]);
    expect(await topshirilganPaketOgohi(5, '2026-03')).toBeNull();
    expect(await topshirilganPaketOgohi(5, null)).toBeNull();
    expect(m.toast).not.toHaveBeenCalled();
  });
  it('tekshiruv xato bersa yoki qotib qolsa — saqlash kutmaydi va yiqilmaydi', async () => {
    m.topshirilganPaketlar.mockRejectedValue(new Error('x'));
    expect(await topshirilganPaketOgohi(5, '2026-03')).toBeNull();
    m.topshirilganPaketlar.mockReturnValue(new Promise(() => undefined));
    expect(await topshirilganPaketOgohi(5, '2026-03', 20)).toBeNull();
    expect(m.toast).not.toHaveBeenCalled();
  });
});
