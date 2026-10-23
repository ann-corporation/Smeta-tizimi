import { describe, expect, it } from 'vitest';
import type { F2Tugun } from '../smeta-anatomiya/f2';
import { f2Indeks, type IshJoyi } from './ishJoyi';
import { kumulyativQolla, kumulyativReja, kumulyativmi } from './kumulyativ';

const manzil = { fayl: 'f.xlsx', varaq: 'V', qator: 1 };
function t(uid: string, tur: F2Tugun['tur'], hajm: number | null, summa: number | null, bolalar: F2Tugun[] = []): F2Tugun {
  return { uid, tur, kod: null, nom: uid, birlik: 'M3', hajm, narx: null, summa, manzil, yol: ['R'], bolalar, barg: bolalar.length === 0 };
}

/** Sintetik kumulyativ varaq: ish A (resurslari bilan, hajm 10), resurssiz ish B. */
function daraxt(): F2Tugun[] {
  const a = t('A', 'bl', 10, null, [t('A1', 'rs', 20, 1000), t('A2', 'rs', 5, 500)]);
  const b = t('B', 'bl', 4, 300);
  return [{ ...t('R', 'rz', null, null, [a, b]) }];
}
const ij = (m: Array<[string, number]>): IshJoyi => ({
  bog: new Map(m.map(([u, q]) => [u, { qatorId: q, holat: 'aniq' as const, usul: 'test' }])), otkaz: new Set(),
});
const BOG = ij([['A', 101], ['A1', 201], ['A2', 202], ['B', 102]]);
const NARX: Record<number, number> = { 103: 20 };

describe('kumulyativ varaq rejimi', () => {
  it('hujjatda «ранее» > 0 bo‘lsagina taklif qilinadi', () => {
    expect(kumulyativmi({ ranee: 660 })).toBe(true);
    expect(kumulyativmi({ ranee: 0 })).toBe(false);
    expect(kumulyativmi({ ranee: null })).toBe(false);
  });

  it('qator bo‘yicha ayirish: ish va resurslari proporsional, storno taklifi bilan jami = ВСЕГО − ранее', () => {
    const ind = f2Indeks(daraxt());
    const reja = kumulyativReja({
      ind, ij: BOG, oldingi: new Map([[101, 3], [103, 5]]), band: new Map(), narx: (id) => NARX[id] ?? null,
      jami: { pryamye: 1800, vsego: 2160, ranee: 660 },
    });
    const a = reja.qatorlar.get('A')!;
    expect(a).toMatchObject({ eski: 10, yangi: 7, oldin: 3 });
    expect(a.pul).toBeCloseTo(450, 6);
    expect(reja.qatorlar.has('B')).toBe(false); // B da oldingi F2 yo'q — tegilmaydi
    expect(reja.qoldiqPul).toBeCloseTo(100, 6);
    expect(reja.storno).toEqual([{ qatorId: 103, hajm: -5, pul: -100 }]);
    expect(reja.nazorat).toMatchObject({ kutilgan: 1500, mos: false, mosStornoBilan: true });
    expect(reja.nazorat!.natija).toBeCloseTo(1620, 6);

    const eff = kumulyativQolla(ind, reja);
    expect(eff.byUid.get('A')!.hajm).toBeCloseTo(7, 9);
    expect(eff.byUid.get('A1')!.hajm).toBeCloseTo(14, 9);
    expect(eff.byUid.get('A1')!.summa).toBeCloseTo(700, 9);
    expect(eff.byUid.get('A2')!.summa).toBeCloseTo(350, 9);
    expect(eff.byUid.get('B')!.hajm).toBe(4);
    // Xom indeks o'zgarmadi.
    expect(ind.byUid.get('A')!.hajm).toBe(10);
  });

  it('oldingi F2 butun hajmni yopgan bo‘lsa — qator yozilmaydi (0 yangi), blok yo‘q', () => {
    const ind = f2Indeks(daraxt());
    const reja = kumulyativReja({
      ind, ij: BOG, oldingi: new Map([[102, 4]]), band: new Map(), narx: () => null,
      jami: { pryamye: 1800, vsego: 1800, ranee: 300 },
    });
    expect(reja.qatorlar.get('B')).toMatchObject({ yangi: 0, oldin: 4 });
    expect(reja.nazorat).toMatchObject({ kutilgan: 1500, mos: true });
    const eff = kumulyativQolla(ind, reja);
    expect(eff.qatorlar.map((x) => x.uid)).toEqual(['A', 'A1', 'A2']);
  });

  it('boshqa qoralamalardagi band hajm ham ayiriladi; rejasiz ◐ taklif qatorlar hisobga olinmaydi', () => {
    const ind = f2Indeks(daraxt());
    const taklif: IshJoyi = { bog: new Map([['A', { qatorId: 101, holat: 'taklif', usul: 'x' }]]), otkaz: new Set() };
    const bosh = kumulyativReja({ ind, ij: taklif, oldingi: new Map([[101, 3]]), band: new Map(), narx: () => null, jami: { pryamye: 1800, vsego: 1800, ranee: 0 } });
    expect(bosh.qatorlar.size).toBe(0);
    const band = kumulyativReja({ ind, ij: BOG, oldingi: new Map(), band: new Map([[101, 2]]), narx: () => null, jami: { pryamye: 1800, vsego: 1800, ranee: 300 } });
    expect(band.qatorlar.get('A')).toMatchObject({ yangi: 8, oldin: 2 });
  });

  it('aniq mos qator topilmasa — qoldiq eng katta nomzoddan qoplanadi, nazorat farqni ko‘rsatadi', () => {
    const ind = f2Indeks(daraxt());
    const reja = kumulyativReja({
      ind, ij: ij([['B', 102]]), oldingi: new Map([[103, 5]]), band: new Map(), narx: (id) => NARX[id] ?? null,
      jami: { pryamye: 300, vsego: 300, ranee: 70 },
    });
    expect(reja.storno).toHaveLength(1);
    expect(reja.storno[0].pul).toBeCloseTo(-70, 6);
    expect(reja.storno[0].hajm).toBeCloseTo(-3.5, 6);
    expect(reja.nazorat!.mosStornoBilan).toBe(true);
  });
});
