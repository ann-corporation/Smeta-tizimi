import { describe, expect, it } from 'vitest';
import {
  davomatBugun, kunYoshi, obyektUlushlari, qoldiqDaraja, skladXulosa, taqsimot, tolovOqimi, tolovUlushi,
  yoqilgiUlush, ZAYAVKA_TARTIB, zayavkaXulosa, zayavkaYetkazish,
} from './kompaniya-ops-korinish';

describe('taqsimot', () => {
  it('tartibdagi har kalit (0 ham) va noma’lumlari oxirida', () => {
    const r = taqsimot([{ s: 'a' }, { s: 'b' }, { s: 'a' }, { s: 'x' }], (q) => q.s, ['a', 'b', 'c'] as string[]);
    expect(r.map((x) => [x.kalit, x.soni])).toEqual([['a', 2], ['b', 1], ['c', 0], ['x', 1]]);
    expect(r[0].ulush).toBeCloseTo(0.5);
  });
  it('bo‘sh ro‘yxat — ulush 0', () => {
    expect(taqsimot([], () => 'draft', ZAYAVKA_TARTIB).every((x) => x.soni === 0 && x.ulush === 0)).toBe(true);
  });
});

describe('zayavka', () => {
  it('yetkazish ulushi va qolgan (server qiymati ustun)', () => {
    expect(zayavkaYetkazish({ requestedQty: 10, deliveredQty: 4, remainingQty: null })).toEqual({ ulush: 0.4, qolgan: 6 });
    expect(zayavkaYetkazish({ requestedQty: 10, deliveredQty: 4, remainingQty: 5 }).qolgan).toBe(5);
    expect(zayavkaYetkazish({ requestedQty: 0, deliveredQty: 0, remainingQty: null }).ulush).toBeNull();
  });
  it('xulosa: ochiq, muddati o‘tgan, yetkazilgan', () => {
    const x = zayavkaXulosa([
      { status: 'submitted', requiredDate: '2026-10-01' },
      { status: 'ordered', requiredDate: '2026-12-01' },
      { status: 'delivered', requiredDate: '2026-09-01' },
      { status: 'cancelled', requiredDate: '2026-09-01' },
    ], '2026-10-25');
    expect(x).toEqual({ jami: 4, ochiq: 2, muddatiOtgan: 1, yetkazilgan: 1 });
  });
  it('kun yoshi; sana yo‘q — null', () => {
    expect(kunYoshi('2026-10-20', new Date('2026-10-25').getTime())).toBe(5);
    expect(kunYoshi(null)).toBeNull();
  });
});

describe('sklad', () => {
  it('manfiy / nol qoldiq va oxirgi harakat', () => {
    expect(skladXulosa([{ qoldiq: -2, oxirgi_harakat: '2026-10-01' }, { qoldiq: 0, oxirgi_harakat: '2026-10-05' }, { qoldiq: 5 }]))
      .toEqual({ pozitsiya: 3, manfiy: 1, nol: 1, oxirgi: '2026-10-05' });
  });
  it('obyekt ulushlari (manfiy ulushga kirmaydi)', () => {
    const r = obyektUlushlari([{ obyekt_id: 1, obyekt_nom: 'A', qoldiq: 30 }, { obyekt_id: 2, obyekt_nom: 'B', qoldiq: 10 }, { obyekt_id: 3, obyekt_nom: 'C', qoldiq: -5 }]);
    expect(r.map((x) => x.ulush)).toEqual([0.75, 0.25, 0]);
    expect(r[2].manfiy).toBe(true);
  });
  it('minimal qoldiqqa nisbatan daraja', () => {
    expect(qoldiqDaraja(5, 10)).toEqual({ ulush: 0.25, minJoy: 0.5, past: true });
    expect(qoldiqDaraja(30, 10).ulush).toBe(1);
    expect(qoldiqDaraja(null, 10).ulush).toBeNull();
  });
});

describe('to‘lov', () => {
  it('kirim / chiqim va oylar', () => {
    const r = tolovOqimi([{ summa: 100, sana: '2026-09-02' }, { summa: -30, sana: '2026-09-10' }, { summa: 50, sana: '2026-10-01' }, { summa: null, sana: '2026-10-01' }]);
    expect(r.kirim).toBe(150);
    expect(r.chiqim).toBe(30);
    expect(r.oylar).toEqual([{ oy: '2026-09', kirim: 100, chiqim: 30 }, { oy: '2026-10', kirim: 50, chiqim: 0 }]);
  });
  it('to‘langan ulushi; bajarilgan 0 — null', () => {
    expect(tolovUlushi(200, 50)).toBe(0.25);
    expect(tolovUlushi(0, 50)).toBeNull();
  });
});

describe('ERP', () => {
  it('bugungi davomat', () => {
    const r = davomatBugun([{ id: 'a' }, { id: 'b' }, { id: 'c' }], [{ ishchiId: 'a', kunlar: [{ sana: 5, holat: 'keldi' }] }, { ishchiId: 'b', kunlar: [{ sana: 5, holat: 'kasal' }] }], 5);
    expect(r).toEqual({ keldi: 1, kelmadi: 0, kasal: 1, belgisiz: 1 });
  });
  it('yoqilg‘i ulushi', () => {
    expect(yoqilgiUlush(50, 200)).toBe(0.25);
    expect(yoqilgiUlush(null, 200)).toBeNull();
  });
});
