import { describe, expect, it } from 'vitest';
import type { F2Tugun } from '../smeta-anatomiya/f2';
import type { SmetaQator } from './index';
import {
  f2Indeks, hisobla, narxFarqiFoiz, rzTaklifHisobla, smetaIndeks, tarkibniMosla, TARKIB_USUL, yozishManbasi, type IshJoyi,
} from './ishJoyi';

const man = { varaq: 'v', qator: 1, ustun: 1 };
function tugun(p: Partial<F2Tugun> & { uid: string; tur: F2Tugun['tur'] }): F2Tugun {
  return {
    kod: null, nom: p.uid, birlik: null, hajm: null, narx: null, summa: null, norma: null, bolalar: [], barg: false,
    yol: [], manzil: man, ...p,
  } as unknown as F2Tugun;
}
const sq = (id: number, otaId: number | null, tur: string, nom: string, extra: Partial<SmetaQator> = {}): SmetaQator =>
  ({ id, otaId, tur, kod: null, nom, birlik: 'Т', hajm: 5, narx: 100, ...extra });

describe('ish narxi tarkibi (Stella protokoli)', () => {
  const res = tugun({ uid: 'r1', tur: 'rs', nom: 'ЗАТРАТЫ ТРУДА МАСТЕРОВ', birlik: 'ЧЕЛ-Ч', hajm: 20, summa: 1000, barg: true });
  const ish = tugun({ uid: 'w1', tur: 'bl', nom: 'ПРОТОКОЛ', birlik: 'Т', hajm: 5, summa: 1000, bolalar: [res] });
  const ind = f2Indeks([tugun({ uid: 'z1', tur: 'rz', nom: 'РАЗДЕЛ', bolalar: [ish] })]);
  const S = smetaIndeks([sq(1, null, 'rz', 'РАЗДЕL'), sq(2, 1, 'bl', 'ПРОТОКОЛ')]);
  const ij: IshJoyi = { bog: new Map([['w1', { qatorId: 2, holat: 'aniq', usul: 'x' }]]), otkaz: new Set() };

  it('resurs summasi ish summasiga teng, smeta ishida bola yo‘q: resurs avtomatik hal', () => {
    const y = tarkibniMosla(ij, ind, S);
    expect(y.bog.get('r1')).toEqual({ qatorId: 2, holat: 'aniq', usul: TARKIB_USUL });
    expect(tarkibniMosla(y, ind, S)).toBe(y); // idempotent
    expect(hisobla(ind, y).kopBog.size).toBe(0);
  });

  it('yozish: pul ikki marta sanalmaydi — ish bitta qator, summa 1000', () => {
    const y = tarkibniMosla(ij, ind, S);
    const m = yozishManbasi(ind, y);
    expect(m.toxtatish).toEqual([]);
    expect(m.nodes).toHaveLength(1);
    expect(m.nodes[0]).toMatchObject({ uid: 'w1', summa: 1000, hajm: 5 });
    expect(m.mapping.get('w1')).toBe(2);
    expect(m.mapping.has('r1')).toBe(false);
  });

  it('summa ±0,5% dan oshsa yoki smeta ishida resurs bolasi bo‘lsa — tarkib emas', () => {
    const boshqa = f2Indeks([tugun({ uid: 'z1', tur: 'rz', bolalar: [tugun({ ...ish, uid: 'w1', summa: 1100, bolalar: [res] })] })]);
    expect(tarkibniMosla(ij, boshqa, S)).toBe(ij);
    const S2 = smetaIndeks([sq(1, null, 'rz', 'R'), sq(2, 1, 'bl', 'ПРОТОКОЛ'), sq(3, 2, 'rs', 'ТРУД')]);
    expect(tarkibniMosla(ij, ind, S2)).toBe(ij);
  });

  it('ish uzilsa avtomatik tarkib bog‘lanishi ham olib tashlanadi; qo‘lda bog‘lanishga tegilmaydi', () => {
    const y = tarkibniMosla(ij, ind, S);
    const uzilgan: IshJoyi = { bog: new Map([['r1', y.bog.get('r1')!]]), otkaz: new Set() };
    expect(tarkibniMosla(uzilgan, ind, S).bog.has('r1')).toBe(false);
    const qolda: IshJoyi = { bog: new Map([['w1', ij.bog.get('w1')!], ['r1', { qatorId: 9, holat: 'qolda', usul: 'qolda' }]]), otkaz: new Set() };
    expect(tarkibniMosla(qolda, ind, S)).toBe(qolda);
  });
});

describe('F2 bo‘limini smeta bo‘limiga taklif qilish (C)', () => {
  const ishlar = [1, 2, 3, 4, 5].map((i) => tugun({ uid: `w${i}`, tur: 'bl', hajm: 1, summa: 10, barg: true }));
  const rz = tugun({ uid: 'z', tur: 'rz', nom: 'СТЕЛЛА', bolalar: ishlar });
  const S = smetaIndeks([sq(1, null, 'rz', 'А'), sq(2, null, 'rz', 'Б'), sq(11, 1, 'bl', 'a'), sq(12, 1, 'bl', 'b'), sq(13, 1, 'bl', 'c'), sq(21, 2, 'bl', 'd')]);
  const bog = (m: Record<string, number>): IshJoyi => ({ bog: new Map(Object.entries(m).map(([k, v]) => [k, { qatorId: v, holat: 'aniq' as const, usul: 'x' }])), otkaz: new Set() });

  it('ishlarning kamida 60% i bitta bo‘limga tushsa — taklif', () => {
    const t = rzTaklifHisobla(rz, bog({ w1: 11, w2: 12, w3: 13, w4: 21 }), S);
    expect(t).toMatchObject({ smetaRzId: 1, soni: 3, jami: 5 });
    expect(t!.ulush).toBeCloseTo(0.6);
  });
  it('60% dan kam yoki aralash — taklif yo‘q', () => {
    expect(rzTaklifHisobla(rz, bog({ w1: 11, w2: 12, w4: 21 }), S)).toBeNull();
    expect(rzTaklifHisobla(rz, bog({}), S)).toBeNull();
  });
  it('◐ taklif va o‘tkazilgan ishlar hisobga olinmaydi', () => {
    const j: IshJoyi = { bog: new Map([...bog({ w1: 11, w2: 12 }).bog, ['w3', { qatorId: 13, holat: 'taklif' as const, usul: 'x' }]]), otkaz: new Set() };
    expect(rzTaklifHisobla(rz, j, S)).toBeNull();
  });
});

describe('narx farqi belgisi (D)', () => {
  it('F2 narxi smetadan qancha farq qiladi — faqat ko‘rsatish', () => {
    expect(narxFarqiFoiz(109.87, 100)).toBeCloseTo(9.87, 2);
    expect(narxFarqiFoiz(90, 100)).toBeCloseTo(-10, 2);
    expect(narxFarqiFoiz(100.2, 100)).toBeNull();
    expect(narxFarqiFoiz(null, 100)).toBeNull();
    expect(narxFarqiFoiz(100, 0)).toBeNull();
  });
});
