import { describe, expect, it } from 'vitest';
import type { F2Tugun } from '../smeta-anatomiya/f2';
import type { SmetaQator } from './index';
import { f2Indeks, smetaIndeks, type IshJoyi } from './ishJoyi';
import { KETMA_KET_USUL, ketmaKetBogla, pastdagilarniBogla } from './ketmaKet';

// SINTETIK: F2 da ish ostidagi «resurslar», smetada razdelda ketma-ket mustaqil qatorlar (orada boshqa qator ham bor).
const man = { varaq: 'v', qator: 1, ustun: 1 };
const tg = (p: Partial<F2Tugun> & { uid: string; tur: F2Tugun['tur'] }): F2Tugun =>
  ({ kod: null, nom: p.uid, birlik: null, hajm: null, narx: null, summa: null, norma: null, bolalar: [], barg: true, yol: [], manzil: man, ...p }) as unknown as F2Tugun;
const sq = (id: number, otaId: number | null, tur: string, kod: string | null, nom: string, birlik: string | null, tartib: number): SmetaQator =>
  ({ id, otaId, tur, kod, nom, birlik, hajm: 1, narx: 1, tartib });

const smeta: SmetaQator[] = [
  sq(1, null, 'rz', null, 'BO‘LIM', null, 1),
  sq(2, 1, 'bl', 'T1', 'SINOV ISHI', '100М', 2),
  sq(3, 2, 'rs', '1', 'ЗАТРАТЫ ТРУДА', 'ЧЕЛ-Ч', 3),
  sq(10, 1, 'mat', '90-1', 'ДЕТАЛЬ Д-20ММ', 'ШТ', 10),
  sq(11, 1, 'mat', '90-2', 'ДЕТАЛЬ Д-25ММ', 'ШТ', 11),
  sq(12, 1, 'mat', '90-9', 'ПРОКЛАДКА РЕЗИНОВАЯ', 'КГ', 12), // F2 da yo'q — o'tkazib yuboriladi
  sq(13, 1, 'mat', '90-3', 'ДЕТАЛЬ Д-32ММ', 'ШТ', 13),
  sq(14, 1, 'mat', '90-4', 'ДЕТАЛЬ Д-40ММ', 'ШТ', 14),
];
const r = (uid: string, kod: string, nom: string, birlik = 'ШТ') => tg({ uid, tur: 'rs', kod, nom, birlik, hajm: 1 });
const r1 = r('r1', '90-1', 'ДЕТАЛЬ Д-20ММ'), r2 = r('r2', '90-2', 'ДЕТАЛЬ Д-25ММ'), r3 = r('r3', '90-3', 'ДЕТАЛЬ Д-32ММ'), r4 = r('r4', '90-4', 'ДЕТАЛЬ Д-40ММ', 'М');
const ish = tg({ uid: 'ish', tur: 'bl', kod: 'T1', nom: 'SINOV ISHI', birlik: '100М', barg: false, bolalar: [r1, r2, r3, r4] });
const ind = f2Indeks([tg({ uid: 'z', tur: 'rz', nom: 'BO‘LIM', barg: false, bolalar: [ish] })]);
const S = smetaIndeks(smeta);
const bosh = (): IshJoyi => ({ bog: new Map([['ish', { qatorId: 2, holat: 'qolda', usul: 'qolda' }]]), otkaz: new Set() });

describe('ketma-ket tarqatib bog‘lash', () => {
  it('belgilanganlar langardan pastga juftlanadi; mos kelmagan smeta qatori o‘tkaziladi; birligi farqli juftlanmaydi', () => {
    const ij0 = bosh();
    const res = ketmaKetBogla(ij0, ind, S, ['r3', 'r1', 'r2', 'r4'], 10);
    expect(res.boglandi).toBe(3);
    expect(res.ij.bog.get('r1')).toMatchObject({ qatorId: 10, holat: 'qolda', usul: KETMA_KET_USUL });
    expect(res.ij.bog.get('r2')?.qatorId).toBe(11);
    expect(res.ij.bog.get('r3')?.qatorId).toBe(13);
    expect(res.ij.bog.has('r4')).toBe(false); // М ↔ ШТ
    expect(res.topilmadi.map((x) => x.uid)).toEqual(['r4']);
    // Orqaga: asl holat o'zgarmagan — bitta qadamda qaytariladi.
    expect(ij0.bog.size).toBe(1);
  });

  it('langar mos kelmasa ham pastdagi mosi topiladi; bitta smeta qatori ikki F2 ga berilmaydi', () => {
    const res = ketmaKetBogla(bosh(), ind, S, ['r2', 'r3'], 10);
    expect(res.ij.bog.get('r2')?.qatorId).toBe(11);
    expect(res.ij.bog.get('r3')?.qatorId).toBe(13);
  });

  it('«⇊ Pastdagi mos qatorlarni ham bog‘lash»: qo‘lda bog‘langandan keyin F2 va smeta qo‘shnilari bo‘yicha davom etadi', () => {
    const ij0: IshJoyi = { bog: new Map([...bosh().bog, ['r1', { qatorId: 10, holat: 'qolda', usul: 'qolda' }]]), otkaz: new Set() };
    const res = pastdagilarniBogla(ij0, ind, S, 'r1');
    expect(res.ij.bog.get('r2')?.qatorId).toBe(11);
    expect(res.ij.bog.get('r3')?.qatorId).toBe(13); // 12 (boshqa material) 3 qatorlik oyna ichida o'tkazildi
    expect(res.ij.bog.has('r4')).toBe(false); // birlik farqli — to'xtadi
    expect(res.boglandi).toBe(2);
  });

  it('aktga kiritilmagan F2 qatoriga tegilmaydi', () => {
    const ij0: IshJoyi = { ...bosh(), otkaz: new Set(['r1']) };
    const res = ketmaKetBogla(ij0, ind, S, ['r1', 'r2'], 10);
    expect(res.ij.bog.has('r1')).toBe(false);
    expect(res.ij.bog.get('r2')?.qatorId).toBe(11);
  });
});
