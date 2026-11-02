import { describe, expect, it } from 'vitest';
import { BOSH, filtrla, noyobQiymatlar, qiymatKalit, type Ustun } from './ustunFiltr';

type R = { id: number; ota: number | null; nom: string; birlik: string | null; summa: number | null };
const rows: R[] = [
  { id: 1, ota: null, nom: 'Razdel A', birlik: null, summa: null },
  { id: 2, ota: 1, nom: 'Beton', birlik: 'm3', summa: 100 },
  { id: 3, ota: 1, nom: 'Armatura', birlik: 't', summa: 0 },
  { id: 4, ota: null, nom: 'Razdel B', birlik: null, summa: null },
  { id: 5, ota: 4, nom: 'Gisht', birlik: 'm3', summa: null },
];
const u: Ustun<R>[] = [
  { kalit: 'nom', nom: 'Nom', tur: 'matn', qiymat: (r) => r.nom },
  { kalit: 'birlik', nom: 'Birlik', tur: 'matn', qiymat: (r) => r.birlik },
  { kalit: 'summa', nom: 'Summa', tur: 'son', qiymat: (r) => r.summa },
];
const daraxt = { id: (r: R) => r.id, ota: (r: R) => r.ota, barg: (r: R) => r.ota != null };

describe('ustun filtri', () => {
  it('NULL ≠ 0: bo‘sh alohida qiymat, 0 — son', () => {
    expect(qiymatKalit(null)).toBe(BOSH);
    expect(qiymatKalit(0)).toBe('0');
    const q = noyobQiymatlar(rows, u, u[2], {}, daraxt.barg).map((x) => x.kalit);
    expect(q).toEqual(['0', '100', BOSH]);
  });
  it('qiymat tanlash + daraxtda ota qator saqlanadi', () => {
    const r = filtrla(rows, u, { birlik: { tanlangan: ['m3'] } }, null, daraxt).map((x) => x.id);
    expect(r).toEqual([1, 2, 4, 5]);
  });
  it('son sharti: bo‘sh qiymat shartga tushmaydi', () => {
    expect(filtrla(rows, u, { summa: { son: { amal: '>=', a: 0 } } }, null, daraxt).map((x) => x.id)).toEqual([1, 2, 3]);
    expect(filtrla(rows, u, { summa: { son: { amal: 'oraliq', a: 50, b: 150 } } }).map((x) => x.id)).toEqual([2]);
  });
  it('matn sharti va bir nechta ustun — VA', () => {
    expect(filtrla(rows, u, { nom: { matn: { amal: 'ichida', q: 'a' } }, birlik: { tanlangan: ['t'] } }, null, daraxt).map((x) => x.id)).toEqual([1, 3]);
  });
  it('saralash: bo‘shlar oxirida', () => {
    expect(filtrla(rows, u, {}, { kalit: 'summa', yonalish: 'kamayish' }).map((x) => x.id)).toEqual([2, 3, 1, 4, 5]);
  });
  it('kaskad: boshqa ustun filtri qiymatlar ro‘yxatini toraytiradi', () => {
    expect(noyobQiymatlar(rows, u, u[0], { birlik: { tanlangan: ['t'] } }, daraxt.barg).map((x) => x.v)).toEqual(['Armatura']);
  });
});
