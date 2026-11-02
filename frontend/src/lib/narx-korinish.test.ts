import { describe, expect, it } from 'vitest';
import { bolaklar, dalilQamrovi, kaskadZinapoya, kfUstamaFoiz, narxOgish, umumiyUstama } from './narx-korinish';

const Q = [
  { key: 'pryamye', label: 'Прямые' }, { key: 'tr_mat', label: 'Tr' }, { key: 'skl_mat', label: 'Skl' },
  { key: 'itogo1', label: 'И1' }, { key: 'nds', label: 'НДС' }, { key: 'vsego', label: 'ВСЕГО' },
];

describe('kaskadZinapoya', () => {
  it('asos → qo‘shimchalar zinapoya bo‘lib ko‘tariladi, jami — 0 dan', () => {
    const z = kaskadZinapoya({ pryamye: 100, tr_mat: 10, skl_mat: 10, itogo1: 120, nds: 30, vsego: 150 }, Q);
    expect(z.map((x) => x.tur)).toEqual(['asos', 'qosh', 'qosh', 'jami', 'qosh', 'jami']);
    expect(z[1].boshi).toBeCloseTo(100 / 150);
    expect(z[1].oxiri).toBeCloseTo(110 / 150);
    expect(z[1].foiz).toBeCloseTo(10);
    expect(z[5].boshi).toBe(0);
    expect(z[5].oxiri).toBeCloseTo(1);
    expect(z.every((x) => x.farq == null)).toBe(true);
  });

  it('jami oldingilar yig‘indisiga mos kelmasa — farq ko‘rsatiladi, keyingi qadam server jamidan davom etadi', () => {
    const z = kaskadZinapoya({ pryamye: 100, tr_mat: 10, skl_mat: 10, itogo1: 125, nds: 25, vsego: 150 }, Q);
    expect(z[3].farq).toBeCloseTo(5);
    expect(z[4].boshi).toBeCloseTo(125 / 150);
  });

  it('noma‘lum qiymat — null (0 deb ko‘rsatilmaydi)', () => {
    const z = kaskadZinapoya({ pryamye: 100, tr_mat: null, itogo1: 100 }, Q.slice(0, 4));
    expect(z[1].qiymat).toBeNull();
    expect(z[1].foiz).toBeNull();
  });
});

describe('ustama va og‘ish', () => {
  it('umumiy ustama % va kf', () => {
    expect(umumiyUstama(100, 150)).toBeCloseTo(50);
    expect(umumiyUstama(0, 150)).toBeNull();
    expect(umumiyUstama(null, 150)).toBeNull();
    expect(kfUstamaFoiz(1.25)).toBeCloseTo(25);
  });

  it('narxOgish: daraja va chiziq markazdan', () => {
    expect(narxOgish(110, 100)).toMatchObject({ foiz: 10, daraja: 'yaqin', boshi: 0.5 });
    expect(narxOgish(110, 100).oxiri).toBeCloseTo(0.6);
    expect(narxOgish(50, 100)).toMatchObject({ foiz: -50, daraja: 'katta', boshi: 0, oxiri: 0.5 });
    expect(narxOgish(300, 100).oxiri).toBe(1);
    expect(narxOgish(100, 100).daraja).toBe('mos');
    expect(narxOgish(100, null).foiz).toBeNull();
    expect(narxOgish(100, 0).daraja).toBe('nomalum');
  });
});

describe('qamrov', () => {
  it('dalil / taklif / yo‘q bo‘laklari', () => {
    const q = dalilQamrovi(10, 4, 3);
    expect(q.jami).toBe(10);
    expect(q.bolaklar.map((b) => b.soni)).toEqual([4, 3, 3]);
    expect(q.bolaklar[0].ulush).toBeCloseTo(0.4);
  });
  it('jami 0 — ulushlar 0', () => {
    expect(bolaklar([{ kalit: 'a', soni: 0 }]).bolaklar[0].ulush).toBe(0);
  });
});

describe('markazXulosa', () => {
  it('g‘olib manba bo‘yicha; natija null — «narx yo‘q»', async () => {
    const { markazXulosa } = await import('./narx-korinish');
    const x = markazXulosa([
      { natija: 10, manba: 'belgilangan', xavf: false }, { natija: 5, manba: 'smeta', xavf: true },
      { natija: null, manba: null, xavf: false }, { natija: 7, manba: 'smeta', xavf: false },
    ]);
    expect(x.jami).toBe(4);
    expect(x.xavf).toBe(1);
    expect(x.bolaklar.map((b) => [b.kalit, b.soni])).toEqual([['belgilangan', 1], ['sana', 0], ['smeta', 2], ['yoq', 1]]);
  });
});
