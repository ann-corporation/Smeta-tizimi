import { describe, expect, it } from 'vitest';
import type { TreeNode } from '../api/types';
import { bolimlarKorinishi, katSmeta, oshganQatorlar, umumiyKesim } from './smeta-korinish';

const node = (p: Partial<TreeNode>): TreeNode => ({ type: 'rs', nom: 'x', varaq: 'v', row: 0, smetaHajm: null, smeta: null, narx: null, fakt: null, qoldiq: null, f2ol: 0, f2mum: 0, ...p });
const tree: TreeNode[] = [
  node({ id: 1, type: 'rz', nom: 'Razdel 1', smeta: 1000, stFakt: 600, stF2: 400, children: [
    node({ id: 2, type: 'bl', nom: 'Ish', children: [
      node({ id: 3, kat: 'ЧЕЛ', smeta: 300, smetaHajm: 10, faktHajm: 12 }),
      node({ id: 4, kat: 'МАТ', smeta: 700, smetaHajm: 5, faktHajm: 2, zamena: true }),
    ] }),
  ] }),
  node({ id: 5, type: 'rz', nom: 'Razdel 2', smeta: 0, stFakt: null, stF2: null, children: [node({ id: 6, smeta: null })] }),
];

describe('smeta anatomiyasi', () => {
  it('umumiy kesim va ulushlar', () => {
    const k = umumiyKesim(tree);
    expect(k).toMatchObject({ smeta: 1000, fakt: 600, f2: 400, qoldiq: 400 });
    expect(k.f2Ulush).toBeCloseTo(0.4);
    expect(k.faktUlush).toBeCloseTo(0.6);
  });
  it('bo‘limlar: ish/resurs soni, oshgan, zamena', () => {
    const [a, b] = bolimlarKorinishi(tree);
    expect(a).toMatchObject({ nom: 'Razdel 1', ishSoni: 1, resursSoni: 2, oshgan: 1, zamena: 1 });
    expect(b.f2Ulush).toBe(0);
  });
  it('kategoriya taqsimoti NULL ni sanaydi, 0 qilmaydi', () => {
    const k = katSmeta(tree);
    expect(k.jami).toBe(1000);
    expect(k.summasiz).toBe(1);
    expect(k.qismlar.map((q) => q.guruh)).toEqual(['chel', 'mat']);
  });
  it('oshgan qatorlar', () => {
    const d = oshganQatorlar(tree);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ bolim: 'Razdel 1', foiz: 120 });
  });
});
