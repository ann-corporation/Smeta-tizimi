import { describe, expect, it } from 'vitest';
import { exactWrite, exactWriteIzohlar } from './f2-exact-write';

describe('F2 kanonik manba kontrakti — exactWrite (hujjat summasi aynan, to‘qilmaydi)', () => {
  const n = { uid: 'f2_0', hajm: 10, narx: 123.45, summa: 1234.49 };
  const mapping = new Map([['f2_0', 123]]);
  it('mustaqil hujjat summasini saqlaydi', () => {
    expect(exactWrite([n], mapping)[0]).toMatchObject({ certifiedQuantity: 10, certifiedUnitPrice: 123.45, certifiedAmount: 1234.49, priceIntentionallyAbsent: false });
  });
  it('moslashmagan qatorni jim tashlamaydi', () => {
    expect(() => exactWrite([n], new Map())).toThrow();
  });
  /* Egasi 2026-10-24: hujjat sonlari aynan yoziladi, akt rad etilmaydi. Summa bor-u narx yo'q:
     narx = summa / hajm (hujjatning o'z sonlari), summa aynan saqlanadi (pul yo'qolmaydi). */
  it.each([undefined, null, 0])('summasi bor-u narxi yo‘q qator: narx = summa / hajm, summa aynan: %s', narx => {
    expect(exactWrite([{ ...n, narx }], mapping)[0]).toMatchObject({ certifiedQuantity: 10, certifiedUnitPrice: 123.449, certifiedAmount: 1234.49, priceIntentionallyAbsent: false });
  });
  it('narxi bor-u hujjatda summasi bo‘sh qator: hajm yoziladi, summa to‘qilmaydi (bo‘sh)', () => {
    expect(exactWrite([{ ...n, summa: undefined }], mapping)[0]).toMatchObject({ certifiedQuantity: 10, certifiedAmount: undefined, priceIntentionallyAbsent: true });
    expect(exactWriteIzohlar([{ ...n, summa: undefined }], mapping).join()).toMatch(/summa yo'q/);
  });
  /* T2-F2-IMPORT-NARXSIZ-BLOK-001: narxi HAM, summasi HAM yo'q qator --
     ЗАТРАТЫ ТРУДА МАШИНИСТОВ / ВОДА kabi, smetada ham narxsiz. Bu normal
     holat: hajm yoziladi, pul yozilmaydi. Ilgari butun fayl rad etilardi. */
  it.each([undefined, null, 0])('narxsiz-u summasiz qatorni hajmi bilan yozadi: %s', narx => {
    const q = exactWrite([{ ...n, narx, summa: 0 }], mapping)[0];
    expect(q).toMatchObject({ certifiedQuantity: 10, certifiedAmount: undefined, priceIntentionallyAbsent: true });
  });
  it('narxli va narxsiz qatorlar aralashgan fayl to‘liq yoziladi', () => {
    const nodes = [n, { uid: 'suv', hajm: 5.738, narx: 0, summa: 0 }];
    const rows = exactWrite(nodes, new Map([...mapping, ['suv', 456]]));
    expect(rows).toHaveLength(2);
    expect(rows.find(r => r.qatorId === 456)).toMatchObject({ certifiedQuantity: 5.738, priceIntentionallyAbsent: true });
    expect(rows.find(r => r.qatorId === 123)).toMatchObject({ certifiedAmount: 1234.49, priceIntentionallyAbsent: false });
  });
  it('summa faqat bir bo‘lakda: summa = hujjatdagi summalar yig‘indisi, to‘qilmaydi, izoh chiqadi', () => {
    const nodes = [n, { ...n, uid: 'b', summa: undefined }];
    const m = new Map([...mapping, ['b', 123]]);
    expect(exactWrite(nodes, m)[0]).toMatchObject({ certifiedQuantity: 20, certifiedUnitPrice: 123.45, certifiedAmount: 1234.49 });
    expect(exactWriteIzohlar(nodes, m).join()).toMatch(/bir qismida/);
  });
  it('bir smeta qatoriga turli narxlar: hajm va summa yig‘iladi, narx = summa / hajm', () => {
    const nodes = [n, { ...n, uid: 'b', narx: 124, summa: 1240 }];
    const m = new Map([...mapping, ['b', 123]]);
    const q = exactWrite(nodes, m)[0];
    expect(q).toMatchObject({ certifiedQuantity: 20, certifiedAmount: 2474.49, priceIntentionallyAbsent: false });
    expect(q.certifiedUnitPrice).toBeCloseTo(123.7245, 6);
    expect(exactWriteIzohlar(nodes, m).join()).toMatch(/turli narxlar/);
  });
  it('hajm 0 bo‘lib summasi bor va narxi yo‘q qator — yagona qolgan to‘xtash (narxni chiqarib bo‘lmaydi)', () => {
    expect(() => exactWrite([{ ...n, hajm: 0, narx: undefined }], mapping)).toThrow(/hajm 0/);
  });
  /* Egasi 2026-10-24 (Fast Food 2-etaj №1): hajmi 0 va summasi 0 bo'lgan resurs qatori bazaga yozilmaydi
     (t2_akt_qator_hajm_check) va butun akt «Ma'lumotni yuklab bo'lmadi» bilan yiqilardi. */
  it('hajm 0 va summa 0 qator aktga kiritilmaydi, qolganlari yoziladi, izoh chiqadi', () => {
    const nodes = [n, { uid: 'nol', hajm: 0, narx: 5, summa: 0 }];
    const m = new Map([['f2_0', 123], ['nol', 456]]);
    const q = exactWrite(nodes, m);
    expect(q.map((x) => x.qatorId)).toEqual([123]);
    expect(exactWriteIzohlar(nodes, m).join()).toMatch(/hajm 0 va summa yo'q/);
  });
  it('hajm 0, summa bor (narx bor) — qaysi qator ekanini aytib to‘xtaydi', () => {
    expect(() => exactWrite([{ ...n, uid: 'LRV 2!9', hajm: 0 }], new Map([['LRV 2!9', 7]]))).toThrow(/LRV 2!9/);
  });
});
