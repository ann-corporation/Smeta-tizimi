import { describe, expect, it } from 'vitest';
import type { F2Tugun } from '../smeta-anatomiya/f2';
import type { SmetaQator } from './index';
import { exactWrite } from '../f2-exact-write';
import {
  bogIdlari, bolakla, f2Indeks, hisobla, rzTaklifHisobla, smetaIndeks, snapshotdanBog, taqsimHisobla, taqsimlabBogla, taqsimNomzodlari,
  taqsimTekshir, TAQSIM_USUL, uz, yozishManbasi, type IshJoyi,
} from './ishJoyi';
import { qoshilganOzgardi } from './qoshilgan';
import { ijniAlmashtir } from './rejali';

/*
 * «Taqsimlab bog'lash» (egasi 2026-10-24): F2 da bitta yig'ma ish (hamma quduqlar), smetada har quduq alohida bo'limda.
 * Sintetik ma'lumot — haqiqiy mijoz ma'lumoti emas.
 */
const S: SmetaQator[] = [
  { id: 1, otaId: null, tur: 'rz', kod: null, nom: 'СМЕТА № 1 ТЕСТ КАНАЛИЗАЦИЯ', birlik: null, hajm: null, tartib: 1 },
  { id: 2, otaId: 1, tur: 'rz', kod: null, nom: 'ЛИСТ А', birlik: null, hajm: null, tartib: 2 },
  { id: 3, otaId: 2, tur: 'rz', kod: null, nom: 'ҚУДУҚ Q-1', birlik: null, hajm: null, tartib: 3 },
  { id: 31, otaId: 3, tur: 'bl', kod: 'E99-1-1', nom: 'ҚУДУҚ ЎРНАТИШ', birlik: '10М3', hajm: 0.09, tartib: 4 },
  { id: 311, otaId: 31, tur: 'rs', kod: '000001', nom: 'ЗАТРАТЫ ТРУДА', birlik: 'ЧЕЛ-Ч', hajm: 9, tartib: 5 },
  { id: 312, otaId: 31, tur: 'mat', kod: '77-1-1', nom: 'БЕТОН ТЕСТ', birlik: 'М3', hajm: 0.9, tartib: 6 },
  { id: 4, otaId: 2, tur: 'rz', kod: null, nom: 'ҚУДУҚ Q-2', birlik: null, hajm: null, tartib: 7 },
  { id: 41, otaId: 4, tur: 'bl', kod: 'E99-1-1', nom: 'ҚУДУҚ ЎРНАТИШ', birlik: '10М3', hajm: 0.018, tartib: 8 },
  { id: 411, otaId: 41, tur: 'rs', kod: '000001', nom: 'ЗАТРАТЫ ТРУДА', birlik: 'ЧЕЛ-Ч', hajm: 1.8, tartib: 9 },
  { id: 412, otaId: 41, tur: 'mat', kod: '77-1-1', nom: 'БЕТОН ТЕСТ', birlik: 'М3', hajm: 0.18, tartib: 10 },
  { id: 5, otaId: 1, tur: 'rz', kod: null, nom: 'ЛИСТ Б', birlik: null, hajm: null, tartib: 11 },
  { id: 6, otaId: 5, tur: 'rz', kod: null, nom: 'ҚУДУҚ Q-27', birlik: null, hajm: null, tartib: 12 },
  { id: 61, otaId: 6, tur: 'bl', kod: 'E99-1-1', nom: 'ҚУДУҚ ЎРНАТИШ', birlik: '10М3', hajm: 0.05, tartib: 13 },
  { id: 611, otaId: 61, tur: 'rs', kod: '000001', nom: 'ЗАТРАТЫ ТРУДА', birlik: 'ЧЕЛ-Ч', hajm: 5, tartib: 14 }, // betoni yo'q
  { id: 62, otaId: 6, tur: 'bl', kod: 'E99-1-1', nom: 'ҚУДУҚ ЎРНАТИШ (ШТ)', birlik: 'ШТ', hajm: 1, tartib: 15 }, // boshqa birlik
  { id: 7, otaId: null, tur: 'rz', kod: null, nom: 'БОШҚА', birlik: null, hajm: null, tartib: 16 },
  { id: 71, otaId: 7, tur: 'bl', kod: 'E11-1-1', nom: 'БОШҚА ИШ', birlik: 'М2', hajm: 10, tartib: 17 },
];
const SI = smetaIndeks(S);

let q = 0;
function t(tur: F2Tugun['tur'], kod: string | null, nom: string, birlik: string | null, hajm: number | null, narx: number | null, summa: number | null, bolalar: F2Tugun[] = []): F2Tugun {
  q++;
  return { uid: `T!${q}`, tur, kod, nom, birlik, hajm, narx, summa, manzil: { fayl: 'f', varaq: 'T', qator: q }, yol: ['ҚУДУҚЛАР'], bolalar, barg: tur !== 'rz' && !bolalar.length };
}
const r1 = t('rs', '000001', 'ЗАТРАТЫ ТРУДА', 'ЧЕЛ-Ч', 20, 1000, 20000);
const r2 = t('mat', '77-1-1', 'БЕТОН ТЕСТ', 'М3', 2, 333.335, 666.67);
const ish = t('bl', 'E99-1-1', 'ҚУДУҚ ЎРНАТИШ', '10М3', 0.2, null, 20666.67, [r1, r2]);
const rz = { ...t('rz', null, 'ҚУДУҚЛАР', null, null, null, null, [ish]), yol: [], barg: false };
const IND = f2Indeks([rz]);
const bosh = (): IshJoyi => ({ bog: new Map(), otkaz: new Set() });
const qoldiqlar = (id: number) => ({ qatorId: id, qoldiq: SI.byId.get(id)!.hajm, smetaHajm: SI.byId.get(id)!.hajm });
const yig = (a: number[]) => a.reduce((x, y) => x + y, 0);

describe('Taqsimlab bog‘lash — bo‘lish arifmetikasi', () => {
  it('bolakla: bo‘laklar yig‘indisi AYNAN jami (hajm 6 xona, summa tiyin); qoldiq oxirgi bo‘lakka', () => {
    const s = bolakla(100.01, [1, 1, 1], 2);
    expect(s).toEqual([33.34, 33.34, 33.33]);
    expect(Math.round(yig(s) * 100)).toBe(10001);
    const h = bolakla(5.09, [0.09, 0.018, 0.05, 4.932], 6);
    expect(Math.round(yig(h) * 1e6)).toBe(5090000);
    for (const x of h) expect(Math.round(x * 1e6) / 1e6).toBe(x);
    // Hujjatdagi summa tiyindan aniqroq bo'lsa ham yig'indi o'zgarmaydi (pul to'qilmaydi).
    const g = bolakla(1234.5678, [1, 2, 3], 2);
    expect(yig(g)).toBeCloseTo(1234.5678, 9);
    expect(bolakla(10, [0, 0], 2)).toEqual([0, 10]);
  });

  it('standart taqsim: smeta tartibida har qator qoldig‘igacha, ortig‘i oxirgi qatorga; manfiy — teskari tartibda bajarilgandan', () => {
    const p = taqsimHisobla(0.2, [31, 41, 61].map(qoldiqlar));
    expect(p.map((x) => x.hajm)).toEqual([0.09, 0.018, 0.092]);
    expect(yig(p.map((x) => x.hajm))).toBeCloseTo(0.2, 12);
    const kam = taqsimHisobla(0.1, [31, 41, 61].map(qoldiqlar));
    expect(kam.map((x) => x.hajm)).toEqual([0.09, 0.01, 0]);
    // Pereraschet: 41 va 61 to'liq bajarilgan (qoldiq 0) — teskari tartibda qaytariladi.
    const minus = taqsimHisobla(-0.06, [
      { qatorId: 31, qoldiq: 0.09, smetaHajm: 0.09 }, { qatorId: 41, qoldiq: 0, smetaHajm: 0.018 }, { qatorId: 61, qoldiq: 0, smetaHajm: 0.05 },
    ]);
    expect(minus.map((x) => x.hajm)).toEqual([0, -0.01, -0.05]);
  });
});

describe('Taqsimlab bog‘lash — nomzodlar va bo‘lim taklifi', () => {
  it('bir xil shifr + AYNAN bir xil birlik, smeta tartibida; doirada 2 tadan kam bo‘lsa ota bo‘limga kengayadi', () => {
    expect(taqsimNomzodlari(ish, SI).map((x) => x.id)).toEqual([31, 41, 61]);
    expect(taqsimNomzodlari(ish, SI, [3]).map((x) => x.id)).toEqual([31, 41]); // Q-1 da bitta → ЛИСТ А
    expect(taqsimNomzodlari(ish, SI, [6]).map((x) => x.id)).toEqual([31, 41, 61]); // Q-27 → ЛИСТ Б (1 ta) → smeta
    expect(taqsimNomzodlari(r1, SI)).toEqual([]);
    expect(taqsimNomzodlari(t('bl', 'E11-1-1', 'БОШҚА ИШ', 'М2', 1, 1, 1), SI)).toEqual([]);
  });

  it('bo‘lim taklifi: F2 hajmi bitta quduq bo‘limidagidan 2 baravardan ko‘p — umumiy ota bo‘lim taklif qilinadi', () => {
    // Dvigatel yig'ma ishni bitta quduqqa (Q-27) bog'lagan holat.
    const ish2 = t('bl', 'E99-1-1', 'ҚУДУҚ ЎРНАТИШ', '10М3', 0.2, null, 100);
    const ish3 = t('bl', 'E99-1-1', 'ҚУДУҚ ЎРНАТИШ', '10М3', 0.2, null, 100);
    const rzF = { ...t('rz', null, 'ҚУДУҚ Q-27', null, null, null, null, [ish2, ish3]), yol: [], barg: false };
    const ij: IshJoyi = { bog: new Map([[ish2.uid, { qatorId: 61, holat: 'qolda', usul: 'qolda' }], [ish3.uid, { qatorId: 61, holat: 'qolda', usul: 'qolda' }]]), otkaz: new Set() };
    const tk = rzTaklifHisobla(rzF, ij, SI);
    expect(tk?.smetaRzId).toBe(1); // Q-27 (0,05) va ЛИСТ Б emas — barcha quduqlarni qamragan smeta bo'limi
    // Hajm mos bo'lsa — kengaytirilmaydi.
    const kichik = { ...rzF, bolalar: [{ ...ish2, hajm: 0.05 }, { ...ish3, hajm: 0.05 }] };
    expect(rzTaklifHisobla(kichik, ij, SI)?.smetaRzId).toBe(6);
  });
});

describe('Taqsimlab bog‘lash — bog‘lash, yozish, uzish', () => {
  const qismlar = taqsimHisobla(0.2, [31, 41, 61].map(qoldiqlar));

  it('ish va resurslari bir xil nisbatda bo‘linadi; resurs topilmagan bo‘lak ulushi qo‘shni bo‘lakka qo‘shiladi', () => {
    const r = taqsimlabBogla(bosh(), ish, qismlar, SI);
    const b = r.ij.bog.get(ish.uid)!;
    expect(b).toMatchObject({ qatorId: 31, holat: 'qolda', usul: TAQSIM_USUL });
    expect(bogIdlari(b)).toEqual([31, 41, 61]);
    const b1 = r.ij.bog.get(r1.uid)!;
    expect(b1.taqsim!.map((x) => x.qatorId)).toEqual([311, 411, 611]);
    expect(b1.taqsim!.map((x) => x.hajm)).toEqual([9, 1.8, 9.2]); // 20 × (0,09 / 0,018 / 0,092) / 0,2
    const b2 = r.ij.bog.get(r2.uid)!;
    expect(b2.taqsim!.map((x) => x.qatorId)).toEqual([312, 412]); // Q-27 da beton yo'q → ulushi Q-2 ga
    expect(Math.round(yig(b2.taqsim!.map((x) => x.hajm)) * 1e6)).toBe(2e6);
    expect(r).toMatchObject({ boglandi: 2, qoldi: 0, taqsimlandi: 2 });
    // Smeta (asl qatorlar) o'zgarmaydi.
    expect(SI.byId.get(31)!.hajm).toBe(0.09);
  });

  it('yozish: N ta akt qatori; hajm va summa yig‘indisi AYNAN F2 qatoridagidek; xotiraga yozilmaydi', () => {
    const ij = taqsimlabBogla(bosh(), ish, qismlar, SI).ij;
    const y = yozishManbasi(IND, ij, SI);
    expect(y.toxtatish).toEqual([]);
    expect(y.nodes).toHaveLength(3 + 3 + 2);
    expect(y.imzolar.size).toBe(0);
    for (const n of y.nodes) expect(y.aslUid.get(n.uid)).toBeTruthy();
    const rows = exactWrite(y.nodes, y.mapping);
    expect(rows).toHaveLength(8);
    const by = new Map(rows.map((r) => [r.qatorId, r]));
    expect(Math.round(yig([31, 41, 61].map((id) => by.get(id)!.certifiedQuantity)) * 1e6)).toBe(0.2e6);
    expect([31, 41, 61].every((id) => by.get(id)!.certifiedAmount == null)).toBe(true); // ish — faqat hajm
    expect(Math.round(yig([311, 411, 611].map((id) => by.get(id)!.certifiedAmount!)) * 100)).toBe(2000000);
    expect(Math.round(yig([312, 412].map((id) => by.get(id)!.certifiedAmount!)) * 100)).toBe(66667);
    expect(Math.round(yig([312, 412].map((id) => by.get(id)!.certifiedQuantity)) * 1e6)).toBe(2e6);
    expect(by.get(311)).toMatchObject({ certifiedQuantity: 9, certifiedAmount: 9000, certifiedUnitPrice: 1000 });
    // Pul F2 hujjatidagi summadan oshmaydi va kam emas.
    const jami = rows.reduce((a, r) => a + (r.certifiedAmount ?? 0), 0);
    expect(Math.round(jami * 100)).toBe(Math.round((20000 + 666.67) * 100));
  });

  it('smeta tomonida har bo‘lak ko‘rinadi; uzish butun taqsimni olib tashlaydi, avvalgi holat (Orqaga) o‘zgarmagan', () => {
    const avval = taqsimlabBogla(bosh(), ish, qismlar, SI).ij;
    const h = hisobla(IND, avval);
    expect(h.tayyor).toBe(3);
    const keyin = uz(avval, ish);
    expect(keyin.bog.size).toBe(0);
    expect(avval.bog.get(ish.uid)?.taqsim).toHaveLength(3); // «Orqaga» uchun saqlangan holat buzilmagan
    expect(yozishManbasi(IND, avval, SI).nodes).toHaveLength(8);
  });

  it('bitta nol bo‘lmagan bo‘lak — oddiy bog‘lanish (taqsimsiz)', () => {
    const r = taqsimlabBogla(bosh(), ish, [{ qatorId: 31, hajm: 0.2 }, { qatorId: 41, hajm: 0 }], SI);
    expect(r.ij.bog.get(ish.uid)).toMatchObject({ qatorId: 31, usul: 'qolda' });
    expect(r.ij.bog.get(ish.uid)?.taqsim).toBeUndefined();
  });

  it('akt snapshotidan tiklash: bir uid bir necha qatorda — taqsim qayta quriladi', () => {
    const b = snapshotdanBog([
      { uid: 'a', qatorId: 31, taqsimHajm: 0.09 }, { uid: 'a', qatorId: 41, taqsimHajm: 0.11 }, { uid: 'b', qatorId: 71 },
    ]);
    expect(b.get('a')).toMatchObject({ qatorId: 31, usul: TAQSIM_USUL, taqsim: [{ qatorId: 31, hajm: 0.09 }, { qatorId: 41, hajm: 0.11 }] });
    expect(b.get('b')).toMatchObject({ qatorId: 71, usul: 'aktdan' });
    expect(b.get('b')?.taqsim).toBeUndefined();
  });

  it('qoralama JSON round-trip va tekshiruv; vaqtinchalik id almashtirish; o‘chirilgan bo‘lak — taqsim uziladi', () => {
    const ij = taqsimlabBogla(bosh(), ish, qismlar, SI).ij;
    const b = ij.bog.get(ish.uid)!;
    const qayta = JSON.parse(JSON.stringify(b)) as typeof b;
    expect(taqsimTekshir(qayta.taqsim)).toEqual(b.taqsim);
    expect(taqsimTekshir([{ qatorId: 31, hajm: 1 }])).toBeUndefined();
    expect(taqsimTekshir([{ qatorId: 31, hajm: 1 }, { qatorId: 'x', hajm: 1 }])).toBeUndefined();
    const tmp: IshJoyi = { bog: new Map([['u', { qatorId: -5, holat: 'qolda', usul: TAQSIM_USUL, taqsim: [{ qatorId: -5, hajm: 1 }, { qatorId: 41, hajm: 1 }] }]]), otkaz: new Set() };
    expect(ijniAlmashtir(tmp, new Map([[-5, 900]])).bog.get('u')).toMatchObject({ qatorId: 900, taqsim: [{ qatorId: 900, hajm: 1 }, { qatorId: 41, hajm: 1 }] });
    const o = qoshilganOzgardi(ij, IND, { eskiIdlar: new Set([41]), mavjud: new Set(S.map((x) => x.id).filter((id) => id !== 41)), S: SI });
    expect(o.ij.bog.has(ish.uid)).toBe(false);
  });
});
