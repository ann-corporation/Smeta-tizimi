import { describe, expect, it } from 'vitest';
import type { FiltrHolat, Ustun } from '../../umumiy/jadval-filtr/ustunFiltr';
import { faktFiltrQatorlar, faktFiltrQoll, type FaktFiltrQator } from './FaktJadvalFiltr';

type Q = { id: number; nom: string; holat: string; fakt: number | null };
type I = Q & { resurslar: Q[]; avtomatik: Q[] };
type B = { bolim: { id: number; otaId: number | null } | null; nisbiy: number; yol?: string; ishlar: I[] };

const q = (id: number, nom: string, holat = 'yangi', fakt: number | null = 0): Q => ({ id, nom, holat, fakt });
const ish = (id: number, nom: string, holat: string, fakt: number | null, resurslar: Q[] = [], avtomatik: Q[] = []): I => ({ ...q(id, nom, holat, fakt), resurslar, avtomatik });

// Tanlangan bo'lim (nisbiy 0) → ichki bo'lim 10 → uning ichki bo'limi 11; alohida ichki bo'lim 20.
const bolaklar = (): B[] => [
  { bolim: null, nisbiy: 0, ishlar: [ish(1, 'Beton quyish', 'qisman', 50, [q(101, 'Beton M300', 'oshdi', 12), q(102, 'Armatura')], [q(103, 'Mehnat')])] },
  { bolim: { id: 10, otaId: 1 }, nisbiy: 1, ishlar: [] },
  { bolim: { id: 11, otaId: 10 }, nisbiy: 2, ishlar: [ish(2, 'G‘isht terish', 'tugadi', 100, [q(201, 'G‘isht')]), ish(3, 'Suvoq', 'yangi', null)] },
  { bolim: { id: 20, otaId: 1 }, nisbiy: 1, ishlar: [ish(4, 'Bo‘yoq', 'yangi', 5)] },
];

const U: Ustun<FaktFiltrQator<Q>>[] = [
  { kalit: 'nom', nom: 'Nom', tur: 'matn', qiymat: (r) => r.q.nom },
  { kalit: 'holat', nom: 'Holat', tur: 'matn', qiymat: (r) => r.q.holat },
  { kalit: 'fakt', nom: 'Fakt', tur: 'son', qiymat: (r) => r.q.fakt },
];
const qoll = (h: FiltrHolat, s: Parameters<typeof faktFiltrQoll>[3] = null) => faktFiltrQoll<Q, I, B>(bolaklar(), U, h, s);
const idlar = (bs: B[]) => bs.map((b) => [b.bolim?.id ?? 0, b.ishlar.map((i) => i.id)]);

describe('Fakt jadvali ustun filtri', () => {
  it('tekis qatorlar: ish + resurslar + avto, ota ish bilan', () => {
    const t = faktFiltrQatorlar<Q>(bolaklar());
    expect(t.map((r) => r.q.id)).toEqual([1, 101, 102, 103, 2, 201, 3, 4]);
    expect(t.find((r) => r.q.id === 103)).toMatchObject({ ishId: 1, bola: true, avto: true });
  });

  it('filtr yo‘q — hammasi o‘zgarmaydi, bolalar to‘liq', () => {
    const r = qoll({});
    expect(idlar(r.bolaklar)).toEqual(idlar(bolaklar()));
    expect(r.bolaKorinadi).toBeNull();
  });

  it('ish o‘z qiymati bo‘yicha mos — bolalari to‘liq ko‘rinadi; bo‘sh bo‘lim shoxlari tashlanadi', () => {
    const r = qoll({ holat: { tanlangan: ['tugadi'] } });
    expect(idlar(r.bolaklar)).toEqual([[0, []], [10, []], [11, [2]]]); // 20 — bo'sh, tashlandi; 10 — ishli avlodi bor
    expect(r.bolaKorinadi!(2, 201)).toBe(true);
  });

  it('faqat resurs mos — ota ish ko‘rinadi, ostida faqat mos resurs', () => {
    const r = qoll({ holat: { tanlangan: ['oshdi'] } });
    expect(idlar(r.bolaklar)).toEqual([[0, [1]]]);
    expect(r.bolaKorinadi!(1, 101)).toBe(true);
    expect(r.bolaKorinadi!(1, 102)).toBe(false);
    expect(r.bolaKorinadi!(1, 103)).toBe(false);
  });

  it('son sharti: NULL ≠ 0, bo‘sh qiymat alohida', () => {
    expect(idlar(qoll({ fakt: { son: { amal: '<', a: 10 } } }).bolaklar)).toEqual([[0, [1]], [10, []], [11, [2]], [20, [4]]]); // ish 1/2 — fakt 0 li resurslari orqali; ish 3 (NULL) — yo'q
    expect(idlar(qoll({ fakt: { tanlangan: ['\u0000bo‘sh'] } }).bolaklar)).toEqual([[0, []], [10, []], [11, [3]]]);
  });

  it('matn sharti va VA mantiq', () => {
    const r = qoll({ nom: { matn: { amal: 'ichida', q: 'beton' } }, holat: { tanlangan: ['qisman'] } });
    expect(idlar(r.bolaklar)).toEqual([[0, [1]]]);
    expect(r.bolaKorinadi!(1, 102)).toBe(true); // ish o'zi mos — bolalari to'liq
  });

  it('qidiruv rejimidagi (yol) bo‘sh bo‘laklar tashlanadi', () => {
    const bs: B[] = [{ bolim: null, nisbiy: 0, yol: 'A', ishlar: [ish(1, 'X', 'yangi', 0)] }, { bolim: null, nisbiy: 0, yol: 'B', ishlar: [ish(2, 'Y', 'tugadi', 1)] }];
    const r = faktFiltrQoll<Q, I, B>(bs, U, { holat: { tanlangan: ['tugadi'] } }, null);
    expect(r.bolaklar.map((b) => b.yol)).toEqual(['B']);
  });

  it('saralash faqat bo‘lim ichida, bo‘shlar oxirida', () => {
    const r = qoll({}, { kalit: 'fakt', yonalish: 'kamayish' });
    expect(idlar(r.bolaklar)).toEqual([[0, [1]], [10, []], [11, [2, 3]], [20, [4]]]);
    const o = qoll({}, { kalit: 'fakt', yonalish: 'osish' });
    expect(o.bolaklar[2].ishlar.map((i) => i.id)).toEqual([2, 3]);
    const n = qoll({}, { kalit: 'nom', yonalish: 'osish' });
    expect(n.bolaklar[2].ishlar.map((i) => i.id)).toEqual([2, 3]);
  });
});
