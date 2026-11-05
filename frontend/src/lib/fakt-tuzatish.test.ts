import { describe, expect, it } from 'vitest';
import { tuzatishPaketi } from './fakt-tuzatish';
import { tuzatishBoglanishlari } from './smeta-anatomiya/tuzatish';
import { jurnalPaket } from './fakt-jurnal';

// Sintetik smeta: bo'lim 1 — asos (50) va ikki tuzatish (+50 / −50); bo'lim 2 — bog'lanmagan tuzatish.
const rows = [
  { id: 11, ota_id: 1, tartib: 1, tur: 'bl', kod: 'E27-4-5-1', nom: 'УСТРОЙСТВО ОСНОВАНИЙ ИЗ ЩЕБНЯ', birlik: '1000М2', hajm: 50 },
  { id: 12, ota_id: 1, tartib: 2, tur: 'bl', kod: 'E27-4-5-4 К=10', nom: 'НА КАЖДЫЙ 1 СМ ИЗМЕНЕНИЯ ТОЛЩИНЫ СЛОЯ ДОБАВЛЯТЬ ИЛИ ИСКЛЮЧАТЬ', birlik: '1000М2', hajm: -50 },
  { id: 13, ota_id: 1, tartib: 3, tur: 'bl', kod: 'E27-1-5-2 К=15', nom: 'НА КАЖДЫЙ 1 СМ ИЗМЕНЕНИЯ ТОЛЩИНЫ СЛОЯ ДОБАВЛЯТЬ/15СМ/ ИЛИ ИСКЛЮЧАТЬ', birlik: '1000М2', hajm: 50 },
  { id: 21, ota_id: 2, tartib: 4, tur: 'bl', kod: 'E6-1-97-1', nom: 'ВЫЧИТАЕТСЯ УСТАНОВКУ АРМАТУРЫ', birlik: 'Т', hajm: -1 },
];
const xarita = tuzatishBoglanishlari(rows);
const smetalar = new Map<number, number | null>(rows.map((r) => [r.id, r.hajm]));

describe('fakt yozuvi — tuzatishlar asosga ergashadi', () => {
  it('asosga «=» 40: tuzatishlar −40 va +40 (joriy faktga delta)', () => {
    const faktlar = new Map<number, number>([[11, 0], [12, 0], [13, 10], [21, 0]]);
    const p = jurnalPaket({ 11: { rejim: '=', qiymat: '40' } }, faktlar, smetalar);
    const r = tuzatishPaketi(p.qatorlar, xarita, faktlar, smetalar);
    expect(r.qatorlar).toEqual([{ qator_id: 11, hajm: 40 }, { qator_id: 12, hajm: -40 }, { qator_id: 13, hajm: 30 }]);
    expect(r.tuzatishlar).toEqual([12, 13]);
  });

  it('«+» rejim: yangi asos fakti = joriy + bugun', () => {
    const faktlar = new Map<number, number>([[11, 20], [12, -20], [13, 20]]);
    const r = tuzatishPaketi([{ qator_id: 11, hajm: 5 }], xarita, faktlar, smetalar);
    expect(r.qatorlar).toEqual([{ qator_id: 11, hajm: 5 }, { qator_id: 12, hajm: -5 }, { qator_id: 13, hajm: 5 }]);
  });

  it('tuzatishga qo‘lda kiritma olib tashlanadi (hosila)', () => {
    const faktlar = new Map<number, number>([[11, 0], [12, 0], [13, 0]]);
    const r = tuzatishPaketi([{ qator_id: 12, hajm: -3 }], xarita, faktlar, smetalar);
    expect(r.qatorlar).toEqual([]);
  });

  it('NULL ≠ 0: asos joriy fakti noma‘lum yoki asos hajmi 0 — tuzatish yozilmaydi', () => {
    const r = tuzatishPaketi([{ qator_id: 11, hajm: 5 }], xarita, new Map<number, number | null>([[11, null]]), smetalar);
    expect(r.qatorlar).toEqual([{ qator_id: 11, hajm: 5 }]);
    const sm0 = new Map(smetalar); sm0.set(11, 0);
    const r0 = tuzatishPaketi([{ qator_id: 11, hajm: 5 }], xarita, new Map([[11, 0]]), sm0);
    expect(r0.tuzatishlar).toEqual([]);
  });

  it('bog‘lanmagan tuzatish va oddiy qatorlar o‘zgarmaydi', () => {
    expect(xarita.boglanmagan.map((b) => b.tuzatishId)).toEqual([21]);
    const r = tuzatishPaketi([{ qator_id: 21, hajm: -1 }], xarita, new Map([[21, 0]]), smetalar);
    expect(r.qatorlar).toEqual([{ qator_id: 21, hajm: -1 }]);
  });
});
