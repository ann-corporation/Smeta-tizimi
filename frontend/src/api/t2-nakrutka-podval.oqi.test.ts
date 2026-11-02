import { beforeEach, describe, expect, it, vi } from 'vitest';

const sbOqi = vi.hoisted(() => vi.fn());
vi.mock('./supabase', () => ({ sbOqi }));
import { obyektPodvaliOqi, ustamaKontekstXatosi } from './t2-nakrutka-podval';

// Eksport darvozasi: «podval yo'q» (standart) va «podval o'qilmadi» farqlanadi — o'qish xatosida hujjat bloklanadi.
const YOZUV = { id: 7, kompaniya_id: 1, obyekt_id: 5, obyekt: null, shartnoma_id: null, shartnoma: null, nom: 'P', qatorlar: [], versiya: 1, kim: null };
beforeEach(() => sbOqi.mockReset());

describe('obyektPodvaliOqi / ustamaKontekstXatosi', () => {
  it('podval yo‘q — ok, null (standart); eksport ochiq', async () => {
    sbOqi.mockResolvedValue({ ok: true, qatorlar: [] });
    const p = await obyektPodvaliOqi(1, 5);
    expect(p).toEqual({ ok: true, podval: null });
    expect(ustamaKontekstXatosi({ ok: true }, p)).toBeNull();
  });
  it('podval bor — o‘qiladi', async () => {
    sbOqi.mockResolvedValue({ ok: true, qatorlar: [YOZUV] });
    const p = await obyektPodvaliOqi(1, 5, null, 7);
    expect(p.ok && p.podval?.nom).toBe('P');
  });
  it('o‘qish xatosi / tarmoq / chala ro‘yxat — ok:false, eksport bloklanadi', async () => {
    sbOqi.mockResolvedValue({ ok: false, error: 'x' });
    const a = await obyektPodvaliOqi(1, 5);
    expect(a.ok).toBe(false);
    expect(ustamaKontekstXatosi({ ok: true }, a)).toBeTruthy();
    sbOqi.mockRejectedValue(new Error('net'));
    expect((await obyektPodvaliOqi(1, 5)).ok).toBe(false);
    sbOqi.mockResolvedValue({ ok: true, toliq: false, qatorlar: [] });
    expect((await obyektPodvaliOqi(1, 5)).ok).toBe(false);
  });
  it('server nakrutka_podval_id ko‘rsatgan, ro‘yxatda yo‘q — bloklanadi', async () => {
    sbOqi.mockResolvedValue({ ok: true, qatorlar: [] });
    const p = await obyektPodvaliOqi(1, 5, null, 99);
    expect(p.ok).toBe(false);
  });
  it('nakrutka o‘qilmadi — sabab', () => {
    expect(ustamaKontekstXatosi(null, { ok: true, podval: null })).toBeTruthy();
    expect(ustamaKontekstXatosi({ ok: false, error: 'E' }, null)).toContain('E');
  });
});
