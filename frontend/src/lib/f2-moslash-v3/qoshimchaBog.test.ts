/**
 * Egasi 2026-10-25 (Sun'iy ko'l): F2 dagi bitta ish ichiga daraxtlar (ko'chatlar) resurs bo'lib kirib qolgan. Operator
 * daraxtlarni smetaning kerakli joylariga QO'LDA bog'ladi, keyin ishning o'zini QO'SHIMCHA ish qildi — va ish hamma
 * daraxtlarni qaytib o'z ichiga tortib oldi (bog'lanishlar yo'qoldi, summa ikki marta). Qoida: allaqachon bog'langan
 * bola qatorlar o'z bog'lanishini saqlaydi; yangi ishga faqat bog'lanmagan (belgilash yo'lida — belgilangan) qatorlar o'tadi.
 */
import { describe, expect, it } from 'vitest';
import type { F2Tugun } from '../smeta-anatomiya/f2';
import type { SmetaQator } from './index';
import { bogla, ishniBogla, smetaIndeks, type IshJoyi } from './ishJoyi';
import { otadiganResurslar, qolganBoglanmagan, rejaliBuyruqQosh, rejaliOchir, type RejaliBuyruq } from './rejali';

let q = 0;
function t(tur: F2Tugun['tur'], nom: string, birlik: string, hajm: number, bolalar: F2Tugun[] = []): F2Tugun {
  q++;
  return { uid: `K!${q}`, tur, kod: null, nom, birlik, hajm, narx: null, summa: null, manzil: { fayl: 'f', varaq: 'K', qator: q }, yol: [], bolalar, barg: tur !== 'rz' && !bolalar.length };
}
const daraxt1 = t('mat', 'САЖЕНЕЦ ДУБ', 'ШТ', 10);
const daraxt2 = t('mat', 'САЖЕНЕЦ КЛЁН', 'ШТ', 5);
const bogsiz = t('rs', 'ЗАТРАТЫ ТРУДА', 'ЧЕЛ-Ч', 40);
const ish = t('bl', 'ПОСАДКА ДЕРЕВЬЕВ', 'ШТ', 15, [daraxt1, daraxt2, bogsiz]);

// Operator daraxtlarni smetaning boshqa joylaridagi resurslarga qo'lda bog'lagan (501, 502), ishning o'zi — bog'lanmagan.
const ij0: IshJoyi = bogla(bogla({ bog: new Map(), otkaz: new Set() }, daraxt1.uid, 501), daraxt2.uid, 502);
const resurs = (r: F2Tugun) => ({ tur: 'mat' as const, nom: r.nom, birlik: r.birlik ?? 'шт', hajm: r.hajm });
const b = (resurslar: ReturnType<typeof resurs>[]): Omit<RejaliBuyruq, 'tempId' | 'resursTempIds' | 'f2Uid' | 'f2ResursUidlar'> => ({
  kind: 'additional', tur: 'bl', otaQatorId: 100, nom: ish.nom, birlik: 'ШТ', hajm: 15, sabab: 'test', resurslar, operationId: 'op-1',
});

describe('qo‘shimcha ish bog‘langan bola qatorlarni tortib olmaydi', () => {
  it('otadiganResurslar: faqat bog‘lanmaganlar; belgilash yo‘lida — faqat belgilanganlar', () => {
    expect(otadiganResurslar(ish, ij0).map((r) => r.uid)).toEqual([bogsiz.uid]);
    // Faqat ishning o'zi belgilangan — faqat ish qo'shiladi, bolalar avvalgi holatida.
    expect(otadiganResurslar(ish, ij0, { tanlov: new Set([ish.uid]) })).toEqual([]);
    expect(qolganBoglanmagan(ish, ij0, []).map((r) => r.uid)).toEqual([bogsiz.uid]);
    // Bog'langan daraxt belgilangan bo'lsa ham — bog'lanishi saqlanadi.
    expect(otadiganResurslar(ish, ij0, { tanlov: new Set([ish.uid, daraxt1.uid, bogsiz.uid]) }).map((r) => r.uid)).toEqual([bogsiz.uid]);
    // O'tkazilgan (otkaz) qaror ham saqlanadi.
    expect(otadiganResurslar(ish, { bog: new Map(), otkaz: new Set([bogsiz.uid]) }).map((r) => r.uid)).toEqual([daraxt1.uid, daraxt2.uid]);
  });

  it('xato qayta hosil: eski chaqiruv (barcha bolalar bilan) ham bog‘langanlarni ko‘chirmaydi; Orqaga — hammasi joyida', () => {
    // Eski yo'l: chaqiruvchi f.bolalar ning hammasini va hammasining resurslarini yuborgan.
    const { buyruq, ij } = rejaliBuyruqQosh([], ij0, ish, b(ish.bolalar.map(resurs)));
    expect(ij.bog.get(daraxt1.uid)?.qatorId).toBe(501);
    expect(ij.bog.get(daraxt2.uid)?.qatorId).toBe(502);
    expect(ij.bog.get(ish.uid)?.qatorId).toBe(buyruq.tempId);
    expect(buyruq.resurslar.map((r) => r.nom)).toEqual(['ЗАТРАТЫ ТРУДА']); // daraxtlar yangi ish tarkibiga tushmaydi
    expect(buyruq.f2ResursUidlar).toEqual([bogsiz.uid]);
    expect(buyruq.resursTempIds).toHaveLength(1);
    expect(ij.bog.get(bogsiz.uid)?.qatorId).toBe(buyruq.resursTempIds[0]);
    // Orqaga (qoralamadan olib tashlash): ish va o'tgan resurs bo'shaydi, daraxtlar bog'lanishi o'zgarmaydi.
    const qayt = rejaliOchir([buyruq], ij, buyruq.tempId);
    expect(qayt.buyruqlar).toEqual([]);
    expect([...qayt.ij.bog.entries()].map(([u, v]) => [u, v.qatorId])).toEqual([[daraxt1.uid, 501], [daraxt2.uid, 502]]);
  });

  it('yangi chaqiruv: faqat o‘tadiganlar yuboriladi — tartib mos', () => {
    const otgan = otadiganResurslar(ish, ij0);
    const { buyruq, ij } = rejaliBuyruqQosh([], ij0, { ...ish, bolalar: otgan }, b(otgan.map(resurs)));
    expect(buyruq.f2ResursUidlar).toEqual([bogsiz.uid]);
    expect(ij.bog.get(daraxt1.uid)?.qatorId).toBe(501);
    expect(ij.bog.get(bogsiz.uid)?.qatorId).toBe(buyruq.resursTempIds[0]);
  });

  it('zamena ham xuddi shu qoida bilan', () => {
    const { buyruq, ij } = rejaliBuyruqQosh([], ij0, ish, { ...b(ish.bolalar.map(resurs)), kind: 'replacement', almashtirilayotganQatorId: 200, keyinQatorId: 200 });
    expect(buyruq.resurslar).toHaveLength(1);
    expect(ij.bog.get(daraxt2.uid)?.qatorId).toBe(502);
  });

  it('ish bilan BIRGA bog‘langan resurs (ishning smeta ishi ichida) — ish bilan ko‘chadi, boshqa joydagisi qoladi', () => {
    // Ish 900 ga bog'langan, daraxt1 — 901 (900 ning resursi), daraxt2 — 502 (boshqa ish ichida).
    const ij = bogla(bogla(bogla({ bog: new Map(), otkaz: new Set() }, ish.uid, 900), daraxt1.uid, 901), daraxt2.uid, 502);
    const ota = new Map([[901, 900], [502, 600]]);
    expect(otadiganResurslar(ish, ij, { smetaOta: (id) => ota.get(id) }).map((r) => r.uid)).toEqual([daraxt1.uid, bogsiz.uid]);
  });
});

describe('ishni mavjud smeta ishiga bog‘lash qo‘lda bog‘langan resursni tortib olmaydi', () => {
  const S: SmetaQator[] = [
    { id: 1, otaId: null, tur: 'rz', kod: null, nom: 'РАЗДЕЛ', birlik: null, hajm: null, tartib: 1 },
    { id: 2, otaId: 1, tur: 'bl', kod: null, nom: 'ПОСАДКА ДЕРЕВЬЕВ', birlik: 'ШТ', hajm: 15, tartib: 2 },
    { id: 3, otaId: 2, tur: 'mat', kod: null, nom: 'САЖЕНЕЦ ДУБ', birlik: 'ШТ', hajm: 10, tartib: 3 },
    { id: 6, otaId: 1, tur: 'bl', kod: null, nom: 'ОЗЕЛЕНЕНИЕ', birlik: 'М2', hajm: 1, tartib: 6 },
    { id: 7, otaId: 6, tur: 'mat', kod: null, nom: 'САЖЕНЕЦ КЛЁН', birlik: 'ШТ', hajm: 5, tartib: 7 },
  ];
  const SI = smetaIndeks(S);
  it('qo‘lda boshqa ishning resursiga bog‘langan daraxt saqlanadi', () => {
    const ij = bogla({ bog: new Map(), otkaz: new Set() }, daraxt2.uid, 7);
    const r = ishniBogla(ij, ish, 2, SI);
    expect(r.ij.bog.get(daraxt2.uid)?.qatorId).toBe(7);
    expect(r.ij.bog.get(daraxt1.uid)?.qatorId).toBe(3);
  });
  it('avvalgi ish bog‘lanishi ichidagi (yoki smetada yo‘q) resurs qayta moslanadi', () => {
    // Ish avval 6 ga bog'langan, daraxt1 6 ning resursi 7 ga — ish 2 ga o'tsa, daraxt1 2 ning ichida qayta topiladi.
    const ij = bogla(bogla({ bog: new Map(), otkaz: new Set() }, ish.uid, 6), daraxt1.uid, 7);
    expect(ishniBogla(ij, ish, 2, SI).ij.bog.get(daraxt1.uid)?.qatorId).toBe(3);
    const ij2 = bogla({ bog: new Map(), otkaz: new Set() }, daraxt1.uid, 9999);
    expect(ishniBogla(ij2, ish, 2, SI).ij.bog.get(daraxt1.uid)?.qatorId).toBe(3);
  });
});
