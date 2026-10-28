import { describe, expect, it } from 'vitest';
import type { F2IerQator } from '../../lib/f2-ierarxiya';
import { filtrla, type Ustun } from '../../umumiy/jadval-filtr/ustunFiltr';
import { hujjatDaraxti, hujjatQatorlar, korinadiganJami, type HujjatQator } from './f2HujjatFiltr';

type L = { akt_qator_id: number; nom: string; summa: number | null };
const q = (qator_id: number, daraja: number, tur: string, bolaSoni: number, qatorlar: L[] = []): F2IerQator<L> =>
  ({ qator_id, daraja, tur, kod: null, nom: 'q' + qator_id, birlik: null, qoshimcha: false, zamena: false, qatorlar, summa: null, bolaSoni });

// Bo'lim 1 → ish 10 (2 resurs), ish 11 (1 resurs); bo'lim 2 → ish 20 (1 resurs).
const ier = [
  q(1, 0, 'rz', 2),
  q(10, 1, 'bl', 0, [{ akt_qator_id: 101, nom: 'beton', summa: 100 }, { akt_qator_id: 102, nom: 'armatura', summa: null }]),
  q(11, 1, 'bl', 0, [{ akt_qator_id: 111, nom: 'beton', summa: 50 }]),
  q(2, 0, 'rz', 1),
  q(20, 1, 'bl', 0, [{ akt_qator_id: 201, nom: 'qum', summa: 7 }]),
];
const ustunlar: Ustun<HujjatQator<L>>[] = [
  { kalit: 'nom', nom: 'nom', tur: 'matn', qiymat: (r) => r.line?.nom },
  { kalit: 'summa', nom: 'summa', tur: 'son', qiymat: (r) => r.line?.summa },
];

describe('hujjatQatorlar', () => {
  it('jadval tartibida yoyadi; barg — hujjat qatori, ota — eng yaqin ota qator', () => {
    const r = hujjatQatorlar(ier);
    expect(r.map((x) => x.id)).toEqual(['o1', 'l101', 'l102', 'l111', 'o2', 'l201']);
    expect(r.map((x) => x.ota)).toEqual([null, 'o1', 'o1', 'o1', null, 'o2']);
    expect(r.find((x) => x.id === 'l102')!.k).toBe(1);
  });
  it('ichma-ich bo‘limlar: ota zanjiri saqlanadi', () => {
    const r = hujjatQatorlar([q(1, 0, 'rz', 1), q(5, 1, 'rz', 1), q(50, 2, 'bl', 0, [{ akt_qator_id: 9, nom: 'x', summa: 1 }]), q(6, 0, 'rz', 0)]);
    expect(r.map((x) => [x.id, x.ota])).toEqual([['o1', null], ['o5', 'o1'], ['l9', 'o5'], ['o6', null]]);
  });
});

describe('daraxt filtri va filtr jami', () => {
  const rows = hujjatQatorlar(ier);
  it('mos qator ota-bobolari bilan qoladi, boshqa bo‘lim tushadi', () => {
    const n = filtrla(rows, ustunlar, { nom: { matn: { amal: 'teng', q: 'beton' } } }, null, hujjatDaraxti<L>());
    expect(n.map((x) => x.id)).toEqual(['o1', 'l101', 'l111']);
    expect(korinadiganJami(n, (l) => l.summa)).toEqual({ summa: 150, soni: 2 });
  });
  it('NULL ≠ 0: summasi noma’lum qator «(bo‘sh)» bo‘lib tanlanadi, jami — null', () => {
    const n = filtrla(rows, ustunlar, { summa: { tanlangan: ['\u0000bo‘sh'] } }, null, hujjatDaraxti<L>());
    expect(n.map((x) => x.id)).toEqual(['o1', 'l102']);
    expect(korinadiganJami(n, (l) => l.summa)).toEqual({ summa: null, soni: 1 });
  });
  it('filtrsiz — hamma qator va to‘liq jami', () => {
    expect(korinadiganJami(rows, (l) => l.summa)).toEqual({ summa: 157, soni: 4 });
  });
});
