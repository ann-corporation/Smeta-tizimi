import { describe, expect, it } from 'vitest';
import type { F2Tugun } from '../smeta-anatomiya/f2';
import { exactWrite } from '../f2-exact-write';
import { f2HajmiSmetaBirligida, f2Indeks, smetaIndeks, yozishManbasi } from './ishJoyi';
import type { SmetaQator } from './index';

const f = (o: Partial<F2Tugun> = {}): F2Tugun => ({ uid: 'F!1', tur: 'bl', kod: null, nom: 'ПЕРЕВОД В БРОНЗУ БАРЕЛЬЕФ', birlik: null, hajm: 5803571428.989, narx: 1, summa: 5803571428.99,
  manzil: { fayl: 'f', varaq: 'F', qator: 1 }, yol: [], bolalar: [], barg: true, ...o });
const s = (o: Partial<SmetaQator> = {}): SmetaQator => ({ id: 951046, otaId: null, tur: 'ob', kod: null, nom: 'ПЕРЕВОД В БРОНЗУ БАРЕЛЬЕФ (VIP ART)', birlik: 'компл', hajm: 1, narx: 16295628753.571415, tartib: 1, ...o });

describe('faqat summa bilan kelgan F2 qatori (Stella «ПЕРЕВОД В БРОНЗУ»)', () => {
  it('birliksiz, narx 1, hajm≈summa → hajm = summa / smeta narx; summa o‘zgarmaydi', () => {
    const r = f2HajmiSmetaBirligida(f(), s());
    expect(r.summaBoyicha).toBe(true);
    expect(r.hajm!).toBeCloseTo(5803571428.99 / 16295628753.571415, 12);
    expect(r.hajm!).toBeCloseTo(0.35614, 4);
    expect(r.narx).toBe(16295628753.571415);
    expect(r.birlik).toBe('компл');
    expect(r.summa).toBe(5803571428.99);
  });
  it('qoldiq endi smeta birligida (компл), so‘mda emas: 1 − 0,356 > 0', () => {
    const r = f2HajmiSmetaBirligida(f(), s());
    expect(1 - r.hajm!).toBeGreaterThan(0.6);
  });
  it('oddiy qatorlar o‘zgarmaydi: birlik bor / narx 1 emas / hajm≠summa / smeta birligi so‘m yoki narxsiz', () => {
    expect(f2HajmiSmetaBirligida(f({ birlik: 'шт' }), s()).summaBoyicha).toBe(false);
    expect(f2HajmiSmetaBirligida(f({ narx: 100, hajm: 58035714.29 }), s()).summaBoyicha).toBe(false);
    expect(f2HajmiSmetaBirligida(f({ hajm: 12 }), s()).summaBoyicha).toBe(false);
    expect(f2HajmiSmetaBirligida(f(), s({ birlik: 'сум' })).summaBoyicha).toBe(false);
    expect(f2HajmiSmetaBirligida(f(), s({ narx: null })).summaBoyicha).toBe(false);
    expect(f2HajmiSmetaBirligida(f(), undefined).summaBoyicha).toBe(false);
  });
  it('F2 ga yozish: hajm 0,356 компл × narx 16,3 mlrd, summa = F2 dagi aniq summa (5,8 mlrd × 16,3 mlrd bo‘lib ketmaydi)', () => {
    const t = f();
    const ind = f2Indeks([t]);
    const S = smetaIndeks([s()]);
    const ij = { bog: new Map([['F!1', { qatorId: 951046, holat: 'qolda' as const, usul: 'qolda' }]]), otkaz: new Set<string>() };
    const bez = yozishManbasi(ind, ij);                       // S bermasa — eski xatti-harakat (xavfli: hajm = so'm)
    expect(bez.nodes[0].hajm).toBeCloseTo(5803571428.989);
    const m = yozishManbasi(ind, ij, S);
    expect(m.toxtatish).toEqual([]);
    expect(m.nodes[0].hajm).toBeCloseTo(0.35614, 4);
    expect(m.nodes[0].narx).toBe(16295628753.571415);
    expect(m.nodes[0].summa).toBe(5803571428.99);
    const q = exactWrite(m.nodes, m.mapping);
    expect(q).toHaveLength(1);
    expect(q[0].qatorId).toBe(951046);
    expect(q[0].certifiedQuantity).toBeCloseTo(0.35614, 4);
    expect(q[0].certifiedAmount).toBe(5803571428.99);
    expect(q[0].certifiedUnitPrice).toBe(16295628753.571415);
  });
});
