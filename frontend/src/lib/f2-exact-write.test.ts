import { describe, expect, it } from 'vitest';
import { exactWrite } from './f2-exact-write';

describe('F2 kanonik manba kontrakti — exactWrite (hujjat summasi aynan, to‘qilmaydi)', () => {
  const n = { uid: 'f2_0', hajm: 10, narx: 123.45, summa: 1234.49 };
  const mapping = new Map([['f2_0', 123]]);
  it('mustaqil hujjat summasini saqlaydi', () => {
    expect(exactWrite([n], mapping)[0]).toMatchObject({ certifiedQuantity: 10, certifiedUnitPrice: 123.45, certifiedAmount: 1234.49, priceIntentionallyAbsent: false });
  });
  it('moslashmagan qatorni jim tashlamaydi', () => {
    expect(() => exactWrite([n], new Map())).toThrow();
  });
  /* Bu qatorda SUMMA bor (1234.49), narx esa yo'q -- ya'ni pul bor-u
     birlik narxi yo'q. Yozilsa RPC `price_intentionally_absent` bo'yicha
     `certified_amount`ni null qilib PULNI YO'QOTARDI. To'xtaydi. */
  it.each([undefined, null, 0])('summasi bor-u narxi yo‘q qatorni yozmaydi (pul yo‘qolardi): %s', narx => {
    expect(() => exactWrite([{ ...n, narx }], mapping)).toThrow();
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
  it('yig‘indi borligi bitta manbadagi yo‘q summani yashirmaydi', () => {
    expect(() => exactWrite([n, { ...n, uid: 'b', summa: undefined }], new Map([...mapping, ['b', 123]]))).toThrow();
  });
  it('bir maqsadga turli narxni birlashtirishni to‘xtatadi', () => {
    expect(() => exactWrite([n, { ...n, uid: 'b', narx: 124 }], new Map([...mapping, ['b', 123]]))).toThrow();
  });
});
