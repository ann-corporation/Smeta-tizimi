import { describe, expect, it } from 'vitest';
import { egaAmallari, YUK_HOLATLAR, YUK_OTISH, yukOtishMumkin, tolovOtish, type TolovHolat } from './holat';
import { StubTolovProvayder, tolovSumma, type TolovSorovi } from './tolov';

describe('yuk holat mashinasi', () => {
  it('asosiy yo‘l', () => {
    const yol = ['qoralama', 'elon', 'takliflar', 'bron', 'yolda', 'yetkazildi', 'yopildi'] as const;
    for (let i = 1; i < yol.length; i++) expect(yukOtishMumkin(yol[i - 1], yol[i])).toBe(true);
  });
  it('yakuniy holatdan chiqish yo‘q; sakrash yo‘q', () => {
    for (const h of ['yopildi', 'bekor', 'muddat_tugadi'] as const) expect(YUK_OTISH[h]).toEqual([]);
    expect(yukOtishMumkin('elon', 'yolda')).toBe(false);
    expect(yukOtishMumkin('bron', 'yopildi')).toBe(false);
  });
  it('har holat jadvalda', () => { expect(Object.keys(YUK_OTISH).sort()).toEqual([...YUK_HOLATLAR].sort()); });
  it('ega amallari', () => {
    expect(egaAmallari('takliflar')).toEqual(['javob', 'bekor']);
    expect(egaAmallari('yetkazildi')).toContain('tasdiq');
    expect(egaAmallari('yopildi')).toEqual(['baho']);
    expect(egaAmallari('yopildi', true)).toEqual([]);
  });
});

describe('to‘lov (escrow) holat mashinasi', () => {
  it('hold → chiqarish so‘rovi (tizim) → release', () => {
    expect(tolovOtish('kutilmoqda', 'hold_ok')).toBe('ushlab_turibdi');
    expect(tolovOtish('chiqarish_sorovi', 'release_ok')).toBe('chiqarildi');
    expect(tolovOtish('qaytarish_sorovi', 'refund_ok')).toBe('qaytarildi');
  });
  it('noto‘g‘ri o‘tish rad etiladi', () => {
    const barcha: TolovHolat[] = ['kutilmoqda', 'ushlab_turibdi', 'chiqarish_sorovi', 'chiqarildi', 'qaytarish_sorovi', 'qaytarildi', 'muzlatilgan', 'xato', 'bekor'];
    expect(tolovOtish('ushlab_turibdi', 'release_ok')).toBeNull(); // avval chiqarish so‘rovi (tasdiq) kerak
    expect(tolovOtish('muzlatilgan', 'refund_ok')).toBeNull();
    expect(barcha.filter((h) => tolovOtish(h, 'hold_ok') !== null)).toEqual(['kutilmoqda']);
  });
});

describe('tolovSumma va STUB provayder', () => {
  it('komissiya 3 %: 800 000 QQS siz, QQS 12 %', () => {
    expect(tolovSumma(800_000, 12, 3)).toEqual({ qqsSiz: 800_000, jami: 896_000, komissiya: 24_000, tashuvchiga: 872_000 });
  });
  it('pilot 0 % komissiya', () => {
    expect(tolovSumma(500_000, 0, 0)).toEqual({ qqsSiz: 500_000, jami: 500_000, komissiya: 0, tashuvchiga: 500_000 });
  });
  it('stub: hold → release hodisalari deterministik va holat mashinasiga mos', async () => {
    const p = new StubTolovProvayder();
    const s: TolovSorovi = { tolovId: 7, bronId: 3, summaQqsSiz: 800_000, qqsFoiz: 12, komissiyaFoiz: 3, operationId: '7c9e6679-7425-40de-944b-e07fc1f90ae7' };
    const h = await p.hold(s);
    expect(h).toMatchObject({ hodisa: 'hold_ok', provider: 'stub', providerRef: 'STUB-hold-7' });
    expect(tolovOtish('kutilmoqda', h.hodisa)).toBe('ushlab_turibdi');
    const r = await p.release(s);
    expect(tolovOtish('chiqarish_sorovi', r.hodisa)).toBe('chiqarildi');
    expect(p.jurnal.map((j) => j.amal)).toEqual(['hold', 'release']);
  });
  it('stub: hold xatosi', async () => {
    const h = await new StubTolovProvayder({ xatoHold: true }).hold({ tolovId: 1, bronId: 1, summaQqsSiz: 1, qqsFoiz: 0, komissiyaFoiz: 0, operationId: 'x' });
    expect(tolovOtish('kutilmoqda', h.hodisa)).toBe('xato');
  });
  it('stub: refund', async () => {
    const e = await new StubTolovProvayder().refund({ tolovId: 1, bronId: 1, summaQqsSiz: 1, qqsFoiz: 0, komissiyaFoiz: 0, operationId: 'y' });
    expect(tolovOtish('qaytarish_sorovi', e.hodisa)).toBe('qaytarildi');
  });
});