import { describe, expect, it } from 'vitest';
import { avatarRangi, boshHarflar, qachon } from './IshJoylarim';

describe('Ish joylarim — Telegram kabi ro‘yxat yordamchilari', () => {
  it('bosh harflar va barqaror avatar rangi', () => {
    expect(boshHarflar('NEW TIMES BUILDINGS')).toBe('NT');
    expect(boshHarflar('«Fast Food» №1')).toBe('FF');
    expect(boshHarflar('anvar')).toBe('A');
    expect(avatarRangi(17)).toBe(avatarRangi(17));
    expect(avatarRangi(17)).not.toBe(avatarRangi(18));
  });
  it('oxirgi faollik — qisqa vaqt; noma’lum bo‘lsa bo‘sh', () => {
    const h = Date.parse('2026-10-22T12:00:00Z');
    expect(qachon(null, h)).toBe('');
    expect(qachon('2026-10-22T11:55:00Z', h)).toBe('5 daq.');
    expect(qachon('2026-10-22T09:00:00Z', h)).toBe('3 soat');
    expect(qachon('2026-10-20T12:00:00Z', h)).toBe('2 kun');
  });
});
