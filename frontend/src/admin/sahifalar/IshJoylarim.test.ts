import { describe, expect, it } from 'vitest';
import { avatarRangi, boshHarflar, ishlarniTartibla, qachon } from './IshJoylarim';

describe('Ish joylarim — «Mening ishlarim» tartibi', () => {
  const ishlar = [{ kompaniya_id: 1, akt_id: 10 }, { kompaniya_id: 2, akt_id: 11 }, { kompaniya_id: 1, akt_id: 12 }, { kompaniya_id: 3, akt_id: 13 }];
  it('faol kompaniya ishlari birinchi, qolgan tartib saqlanadi; kompaniya almashganda qayta tartiblanadi', () => {
    expect(ishlarniTartibla(ishlar, 3).map((x) => x.akt_id)).toEqual([13, 10, 11, 12]);
    expect(ishlarniTartibla(ishlar, 1).map((x) => x.akt_id)).toEqual([10, 12, 11, 13]);
    expect(ishlarniTartibla(ishlar, 2).map((x) => x.akt_id)).toEqual([11, 10, 12, 13]);
  });
  it('faol kompaniya yo‘q yoki ishi yo‘q — asl tartib; asl massiv o‘zgarmaydi', () => {
    expect(ishlarniTartibla(ishlar, null)).toEqual(ishlar);
    expect(ishlarniTartibla(ishlar, 99)).toEqual(ishlar);
    ishlarniTartibla(ishlar, 3);
    expect(ishlar[0].akt_id).toBe(10);
  });
});

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
