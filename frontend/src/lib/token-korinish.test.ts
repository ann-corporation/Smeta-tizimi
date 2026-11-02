import { describe, expect, it } from 'vitest';
import { balansOlchov, kunlikSarf } from './token-korinish';

const bugun = new Date(2026, 9, 25, 12);
const iso = (d: number, h = 10) => new Date(2026, 9, d, h).toISOString();

describe('token ko‘rinishi', () => {
  it('kunlik sarf: oxirgi 30 kun, bo‘sh kunlar 0, eski harakat kirmaydi', () => {
    const k = kunlikSarf([{ miqdor: -100, tur: 'sarf', yaratildi: iso(25) }, { miqdor: -50, tur: 'sarf', yaratildi: iso(25, 15) }, { miqdor: 500, tur: 'toldirish', yaratildi: iso(20) }, { miqdor: -999, tur: 'sarf', yaratildi: new Date(2026, 8, 1).toISOString() }], bugun);
    expect(k).toHaveLength(30);
    expect(k[29]).toEqual({ sana: '2026-10-25', sarf: 150, kirim: 0 });
    expect(k.find((x) => x.sana === '2026-10-20')?.kirim).toBe(500);
    expect(k.reduce((s, x) => s + x.sarf, 0)).toBe(150);
  });
  it('balans o‘lchovi: necha kunga yetadi; sarf yo‘q — noma’lum; 0 — tugagan', () => {
    const k = kunlikSarf([{ miqdor: -300, tur: 'sarf', yaratildi: iso(24) }], bugun);
    expect(balansOlchov(100, k)).toMatchObject({ sarf30: 300, kunlik: 10, kunlarga: 10, holat: 'yetarli' });
    expect(balansOlchov(30, k)).toMatchObject({ kunlarga: 3, holat: 'kam' });
    expect(balansOlchov(500, kunlikSarf([], bugun))).toMatchObject({ kunlik: null, kunlarga: null, ulush: 1, holat: 'nomalum' });
    expect(balansOlchov(0, k)).toMatchObject({ ulush: 0, holat: 'tugagan' });
  });
});
