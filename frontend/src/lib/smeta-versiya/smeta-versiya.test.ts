import { describe, expect, it } from 'vitest';
import { oxshashlik } from './oxshash';
import { versiyaMoslash } from './moslash';
import { kodNorm, lsAjrat, qatorlardanPozitsiyalar, razdelNorm, type JQator } from './pozitsiya';
import { davaHajm, katalogQur, pozitsiyaPul, qarorKerak, qatorPul, bosBolim, bolimgaQosh } from './hisob';
import type { VPozitsiya } from './turlar';

/* Barcha ma'lumot SINTETIK (real mijoz smetasi yo'q). */
const poz = (o: Partial<VPozitsiya> & { nom: string }): VPozitsiya => ({
  tartib: 0, lsKod: '01-01', lsNom: 'СИНТЕТИКА', razdel: 'РАЗДЕЛ 1: А', blok: 'БЛОК', raqam: null, kod: null, birlik: 'М3', hajm: 1, resurslar: [], ...o,
});

describe('oxshashlik (Ratcliff–Obershelp)', () => {
  it('difflib bilan bir xil natija', () => {
    expect(oxshashlik('abcd', 'abcd')).toBe(1);
    expect(oxshashlik('', '')).toBe(1);
    expect(oxshashlik('abcd', 'bcde')).toBeCloseTo(0.75, 6); // difflib: 0.75
    expect(oxshashlik('ГРАНИТНЫЕ ПЛИТЫ', 'БЕТОННЫЕ ПЛИТКИ')).toBeLessThan(0.7);
  });
});

describe('kalitlar', () => {
  it('LS, razdel, shifr', () => {
    expect(lsAjrat('РАЗДЕЛ: СМЕТА № 03-03 НА БЛОГОУСТРОЙСТВА(ЗАМЕН)')).toEqual({ kod: '03-03', nom: 'БЛОГОУСТРОЙСТВА(ЗАМЕН)' });
    expect(lsAjrat('ПОЛ')).toBeNull();
    expect(razdelNorm('РАЗДЕЛ 1: БЛОГОУСТРОЙСТВО')).toBe(razdelNorm('РАЗДЕЛ: БЛОГОУСТРОЙСТВО'));
    expect(kodNorm('Е27-13-8-3')).toBe(kodNorm('E27-13-8-3')); // kirill Е = lotin E
  });
});

describe('versiyaMoslash', () => {
  const eski = [
    poz({ kod: 'E1', nom: 'ИШ А', hajm: 100 }),                                   // kamaygan
    poz({ kod: 'E2', nom: 'ИШ Б', hajm: 5 }),                                     // o'zgarmagan (blok farq)
    poz({ kod: 'E3', nom: 'ГРАНИТНЫЕ ПЛИТЫ', birlik: '100М2', hajm: 628.62 }),   // zamena
    poz({ kod: 'E4', nom: 'ГАЗОН ПАРТЕРНЫЙ', hajm: 12 }),                        // o'chirilgan
    poz({ kod: 'E5', nom: 'АРМАТУРА', birlik: 'Т', hajm: 7 }),                    // birlik farq
    poz({ kod: 'E6', nom: 'НОМЛИ ИШ', hajm: null }),                              // hajm noma'lum
  ];
  const joriy = [
    poz({ kod: 'E1', nom: 'ИШ А', hajm: 80 }),
    poz({ kod: 'E2', nom: 'ИШ Б', hajm: 5, blok: 'БОШҚА БЛОК' }),
    poz({ kod: 'E27', nom: 'БЕТОННЫЕ ПЛИТКИ', birlik: '100М2', hajm: 628.62 }),
    poz({ kod: 'E5', nom: 'АРМАТУРА', birlik: 'КГ', hajm: 7000 }),
    poz({ kod: 'E6', nom: 'НОМЛИ ИШ', hajm: 3 }),
    poz({ kod: 'E9', nom: 'ЯНГИ ИШ', hajm: 1 }),
  ];
  const m = versiyaMoslash(eski, joriy);
  const by = (e: number) => m.find((x) => x.eski === e)!;
  it('holatlar compare.py pog‘onalari bo‘yicha', () => {
    expect(by(0)).toMatchObject({ joriy: 0, holat: 'kamaygan', ishonch: 100 });
    expect(by(1)).toMatchObject({ joriy: 1, holat: 'ozgarmagan', ishonch: 90 });
    expect(by(2)).toMatchObject({ joriy: 2, holat: 'almashtirilgan', ishonch: 70 });
    expect(by(3)).toMatchObject({ joriy: null, holat: 'ochirilgan' });
    expect(by(4)).toMatchObject({ joriy: 3, holat: 'noaniq', birlikFarq: true, ishonch: 60 });
    expect(by(5)).toMatchObject({ joriy: 4, holat: 'noaniq' });
    expect(by(5).usul).toContain('hajm noma');
    expect(m.find((x) => x.joriy === 5)).toMatchObject({ eski: null, holat: 'yangi' });
    expect(m).toHaveLength(7);
  });
  it('har joriy qator ko‘pi bilan bitta juftda', () => {
    const j = m.filter((x) => x.joriy != null).map((x) => x.joriy);
    expect(new Set(j).size).toBe(j.length);
  });
  it('smetaga keyin qo‘shilgan qator asosiy moslashni «o‘g‘irlamaydi», o‘zi faqat «noaniq» juft bo‘ladi', () => {
    const e = [poz({ kod: 'G', nom: 'ГРАНИТ', birlik: '100М2', hajm: 628 }), poz({ kod: 'G', nom: 'ГРАНИТ', birlik: '100М2', hajm: 88, blok: 'Б2' })];
    const j = [{ ...poz({ kod: 'G', nom: 'ГРАНИТ', birlik: '100М2', hajm: 116 }), qoshimcha: true }, poz({ kod: 'B', nom: 'БЕТОН ПЛИТКА', birlik: '100М2', hajm: 628 })];
    const r = versiyaMoslash(e, j);
    expect(r.find((x) => x.eski === 0)).toMatchObject({ joriy: 1, holat: 'almashtirilgan' });
    expect(r.find((x) => x.eski === 1)).toMatchObject({ joriy: 0, holat: 'noaniq' });
    expect(r.find((x) => x.eski === 1)!.usul).toContain('qo‘shimcha');
    expect(r).toHaveLength(2);
  });
  it('LS nomi biroz farq qilsa ham juftlanadi, boshqa LS ga o‘tmaydi', () => {
    const r = versiyaMoslash([poz({ kod: 'E1', nom: 'X', lsNom: 'БЛОГОУСТРОЙСТВО' })],
      [poz({ kod: 'E1', nom: 'X', lsNom: 'БЛОГОУСТРОЙСТВА' }), poz({ kod: 'E1', nom: 'X', lsKod: '02-02', lsNom: 'БОШҚА' })]);
    expect(r.find((x) => x.eski === 0)).toMatchObject({ joriy: 0, holat: 'ozgarmagan' });
  });
});

describe('qatorlardanPozitsiyalar', () => {
  const rows: JQator[] = [
    { id: 1, ota_id: null, tur: 'rz', kod: null, nom: 'РАЗДЕЛ: СМЕТА № 01-01 НА СИНТЕТИКА', birlik: null, hajm: null },
    { id: 2, ota_id: 1, tur: 'rz', kod: null, nom: 'РАЗДЕЛ: А', birlik: null, hajm: null },
    { id: 3, ota_id: 2, tur: 'rz', kod: null, nom: 'БЛОК', birlik: null, hajm: null },
    { id: 4, ota_id: 3, tur: 'bl', kod: 'E1', nom: 'ИШ А', birlik: 'М3', hajm: 80 },
    { id: 5, ota_id: 4, tur: 'rs', kod: '000001', nom: 'ТРУД', birlik: 'ЧЕЛ-Ч', hajm: 160, narx: 10, kat: 'ЧЕЛ' },
    { id: 6, ota_id: 4, tur: 'mat', kod: 'M1', nom: 'БЕТОН', birlik: 'М3', hajm: 80, narx: 100, kat: 'МАТ' },
    { id: 7, ota_id: 3, tur: 'mat', kod: 'M2', nom: 'ПЛИТКА', birlik: 'Т', hajm: 2, narx: 50, kat: 'МАТ' },
    { id: 8, ota_id: null, tur: 'rz', kod: null, nom: 'СУНЪИЙ КЎЛ (ekspertizagacha)', birlik: null, hajm: null },
    { id: 9, ota_id: 8, tur: 'bl', kod: 'E1', nom: 'ИШ А', birlik: 'М3', hajm: 100 },
  ];
  it('bl va mustaqil mat — pozitsiya; ish ichidagi mat — resurs; «(ekspertizagacha)» chiqariladi', () => {
    const r = qatorlardanPozitsiyalar(rows);
    expect(r.eskiChiqarildi).toBe(1);
    expect(r.pozitsiyalar.map((p) => p.qatorId)).toEqual([4, 7]);
    expect(r.pozitsiyalar[0]).toMatchObject({ lsKod: '01-01', lsNom: 'СИНТЕТИКА', razdel: 'РАЗДЕЛ: А', blok: 'БЛОК' });
    expect(r.pozitsiyalar[0].resurslar).toHaveLength(2);
  });
  it('katalog va pozitsiya narxi (NULL narx summaga 0 bo‘lib kirmaydi)', () => {
    const k = katalogQur(rows);
    const p = qatorlardanPozitsiyalar(rows).pozitsiyalar[0];
    expect(pozitsiyaPul(p, k)).toMatchObject({ summa: 160 * 10 + 80 * 100, narxsiz: 0 });
    const eskiP = { kod: 'E1', nom: 'ИШ А', birlik: 'М3', hajm: 100, resurslar: [
      { kod: '000001', nom: 'ТРУД', birlik: 'ЧЕЛ-Ч', norma: 2, hajm: 200 },
      { kod: 'NOMALUM', nom: 'X', birlik: 'Т', norma: 1, hajm: 5 },
      { kod: 'M1', nom: 'БЕТОН', birlik: 'М3', norma: 1, hajm: null }] };
    expect(pozitsiyaPul(eskiP, k)).toMatchObject({ summa: 2000 + 100 * 100, narxsiz: 1 }); // M1 norma × hajm
    expect(pozitsiyaPul({ kod: 'YOQ', nom: 'Y', birlik: 'Т', hajm: 3, resurslar: [] }, k)).toMatchObject({ summa: null, narxsiz: 1 });
  });
});

describe('da’vo (egasi qarori 2026-10-26; SQL t2_smeta_versiya_dava_hajm bilan bir xil)', () => {
  const b = { holat: 'kamaygan' as const, eskiHajm: 100, joriyHajm: 80, birlikFarq: false, qurilganHajm: null };
  it('Codex §14 #1: asl 100 → ekspertiza 80, o‘lchangan 95 → 15; qurilgan → 20', () => {
    expect(davaHajm({ ...b, qaror: 'qisman', qurilganHajm: 95 })).toBe(15);
    expect(davaHajm({ ...b, qaror: 'qurilgan' })).toBe(20);
    expect(davaHajm({ ...b, qaror: 'qurilmagan' })).toBeNull();
    expect(davaHajm({ ...b, qaror: 'kutilmoqda' })).toBeNull();
    expect(davaHajm({ ...b, qaror: 'qisman', qurilganHajm: 70 })).toBe(0);
  });
  it('#2: joriy hajm noma‘lum yoki birlik farq — to‘qilmaydi', () => {
    expect(davaHajm({ ...b, joriyHajm: null, qaror: 'qurilgan' })).toBeNull();
    expect(davaHajm({ ...b, holat: 'noaniq', birlikFarq: true, qaror: 'qurilgan' })).toBeNull();
  });
  it('o‘chirilgan / almashtirilgan — to‘liq qurilgan hajm', () => {
    expect(davaHajm({ ...b, holat: 'ochirilgan', joriyHajm: null, qaror: 'qurilgan' })).toBe(100);
    expect(davaHajm({ ...b, holat: 'almashtirilgan', qaror: 'qisman', qurilganHajm: 40 })).toBe(40);
  });
  it('qaror kerak bo‘lgan holatlar', () => {
    expect(qarorKerak(b)).toBe(true);
    expect(qarorKerak({ ...b, holat: 'oshgan' })).toBe(false);
    expect(qarorKerak({ ...b, holat: 'noaniq', eskiHajm: 5, joriyHajm: 10 })).toBe(false);
    expect(qarorKerak({ ...b, holat: 'noaniq', birlikFarq: true })).toBe(true);
  });
  it('da’vo summasi joriy narxdan, bo‘lim jami kesilgan/oshgan', () => {
    const k = katalogQur([{ id: 1, ota_id: null, tur: 'mat', kod: 'M', nom: 'M', birlik: 'М3', hajm: 1, narx: 10, kat: 'МАТ' }]);
    const e = pozitsiyaPul({ kod: 'M', nom: 'M', birlik: 'М3', hajm: 100, resurslar: [] }, k);
    const j = pozitsiyaPul({ kod: 'M', nom: 'M', birlik: 'М3', hajm: 80, resurslar: [] }, k);
    const p = qatorPul({ ...b, qaror: 'qisman', qurilganHajm: 95 }, e, j);
    expect(p.farq).toBe(-200);
    expect(p.dava).toBeCloseTo(150, 6);
    const bj = bosBolim('x', '01', 'X');
    bolimgaQosh(bj, p, { holat: 'kamaygan', qaror: 'qisman', qarorKerak: true });
    expect(bj).toMatchObject({ eski: 1000, joriy: 800, kesilgan: 200, oshgan: 0, qarorKutilmoqda: 0 });
    expect(bj.dava).toBeCloseTo(150, 6);
    const o = qatorPul({ ...b, holat: 'ochirilgan', joriyHajm: null, qaror: 'qurilgan' }, e, null);
    expect(o).toMatchObject({ farq: -1000, davaHajm: 100, dava: 1000 });
  });
});
