import { describe, expect, it } from 'vitest';
import type { TreeNode } from '../api/types';
import { aslBarglar, aslSmeta, bolimlarKorinishi, katSmeta, oshganQatorlar, umumiyKesim } from './smeta-korinish';

const node = (p: Partial<TreeNode>): TreeNode => ({ type: 'rs', nom: 'x', varaq: 'v', row: 0, smetaHajm: null, smeta: null, narx: null, fakt: null, qoldiq: null, f2ol: 0, f2mum: 0, ...p });
const tree: TreeNode[] = [
  node({ id: 1, type: 'rz', nom: 'Razdel 1', smeta: 1000, stFakt: 600, stF2: 400, children: [
    node({ id: 2, type: 'bl', nom: 'Ish', smetaHajm: 10, faktHajm: 12, children: [
      node({ id: 3, kat: 'ЧЕЛ', smeta: 300, smetaHajm: 10, faktHajm: 12 }),
      node({ id: 4, kat: 'МАТ', smeta: 700, smetaHajm: 5, faktHajm: 2 }),
      node({ id: 7, kat: 'МАТ', smeta: null, zamena: true }),
    ] }),
  ] }),
  node({ id: 5, type: 'rz', nom: 'Razdel 2', smeta: 0, stFakt: null, stF2: null, children: [node({ id: 6, smeta: null })] }),
];

describe('smeta anatomiyasi', () => {
  it('umumiy kesim va ulushlar', () => {
    const k = umumiyKesim(tree);
    // qoldiq = smeta − F2 (MAX(fakt, F2) qoidasi yo'q)
    expect(k).toMatchObject({ smeta: 1000, fakt: 600, f2: 400, qoldiq: 600 });
    expect(k.toliq).toBe(false);
    expect(k.f2Ulush).toBeCloseTo(0.4);
    expect(k.faktUlush).toBeCloseTo(0.6);
  });
  it('bo‘limlar: ish/resurs soni, oshgan, zamena', () => {
    const [a, b] = bolimlarKorinishi(tree);
    expect(a).toMatchObject({ nom: 'Razdel 1', ishSoni: 1, resursSoni: 3, oshgan: 1, zamena: 1 });
    expect(b.f2Ulush).toBeNull();
    expect(b.toliq).toBe(false);
  });
  it('NULL ≠ 0: hammasi noma’lum bo‘lsa jami null, aralash bo‘lsa toliq=false', () => {
    const hammasi = umumiyKesim([node({ id: 9, type: 'rz', smeta: null, stFakt: null, stF2: null })]);
    expect(hammasi).toMatchObject({ smeta: null, fakt: null, f2: null, qoldiq: null, f2Ulush: null, toliq: false });
    const aralash = umumiyKesim(tree);
    expect(aralash.toliq).toBe(false);
    expect(aralash.nomalum).toEqual({ smeta: 0, fakt: 1, f2: 1 });
    expect(aralash.smeta).toBe(1000);
  });
  it('kategoriya taqsimoti NULL ni sanaydi, 0 qilmaydi', () => {
    const k = katSmeta(tree);
    expect(k.jami).toBe(1000);
    expect(k.summasiz).toBe(1);
    expect(k.qismlar.map((q) => q.guruh)).toEqual(['chel', 'mat']);
  });
  it('smeta — CONST: qo‘shimcha/zamena tugunlari asl smetaga kirmaydi (egasi 2026-11-06)', () => {
    // t2_rollup rz/bl summasiga qo'shimcha va zamenani qo'shadi: rz 3600 = bl 1000 + М1 1000 + М2 300 + qo'shimcha bl 500 + zamena 800.
    const daraxt: TreeNode[] = [node({ id: 10, type: 'rz', nom: 'R', smeta: 3600, stFakt: 0, stF2: 900, children: [
      node({ id: 11, type: 'bl', smeta: 1000, children: [node({ id: 12, kat: 'ЧЕЛ', smeta: 1000 })] }),
      node({ id: 13, type: 'mat', kat: 'МАТ', smeta: 1000 }),
      node({ id: 14, type: 'mat', kat: 'МАТ', smeta: 300 }),
      node({ id: 15, type: 'bl', smeta: 500, qoshimcha: true, children: [node({ id: 16, kat: 'ЧЕЛ', smeta: 500, qoshimcha: true })] }),
      node({ id: 17, type: 'mat', kat: 'МАТ', smeta: 800, qoshimcha: true, zamena: true }),
    ] })];
    expect(aslSmeta(daraxt[0])).toBe(2300);
    const k = umumiyKesim(daraxt);
    expect(k.smeta).toBe(2300);
    // Qoldiq avvalgidek qatorlar bo'yicha: to'liq daraxt smetasi − F2.
    expect(k.qoldiq).toBe(2700);
    expect([...aslBarglar(daraxt)].map((b) => b.id)).toEqual([12, 13, 14]);
    expect(katSmeta(daraxt).jami).toBe(2300);
    // Qo'shimcha bo'limning o'zi — asl smeta 0 (u «O'zgarishlar» qatlamida).
    expect(aslSmeta(node({ id: 20, type: 'rz', smeta: 500, ozgarishGuruh: 'qoshimcha' }))).toBe(0);
  });
  it('oshgan qatorlar', () => {
    const d = oshganQatorlar(tree);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ bolim: 'Razdel 1', foiz: 120 });
  });
});
