import { describe, expect, it } from 'vitest';
import {
  f2AggregatsiyaQator,
  f2ExactPayloadQur,
  f2IstisnolarniAniqla,
  type F2ExactManbaTugun,
  type F2ExactQator,
} from './f2-exact-payload';

describe('F2 exact-source aggregation — merge by qator_id', () => {
  it('sums hajm and summa across multiple F2 rows bound to the same smeta row', () => {
    const nodes: F2ExactManbaTugun[] = [
      { uid: 'a', hajm: 10, narx: 123.45, summa: 1234.5 },
      { uid: 'b', hajm: 5, narx: 123.45, summa: 617.25 },
    ];
    const rows = f2AggregatsiyaQator(nodes, () => 900);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ qator_id: 900, hajm: 15, summa: 1851.75, summaBor: true, narx: 123.45 });
  });

  it('unbound nodes (getSmetaId returns null/undefined) are dropped, not aggregated into row 0', () => {
    const nodes: F2ExactManbaTugun[] = [
      { uid: 'bound', hajm: 10, narx: 100, summa: 1000 },
      { uid: 'unbound', hajm: 999, narx: 1, summa: 999 },
    ];
    const rows = f2AggregatsiyaQator(nodes, (uid) => (uid === 'bound' ? 5 : null));
    expect(rows).toHaveLength(1);
    expect(rows[0].qator_id).toBe(5);
    expect(rows[0].hajm).toBe(10);
  });

  it('summaBor stays false when every merged fragment has zero/missing summa, even with a real hajm', () => {
    const nodes: F2ExactManbaTugun[] = [
      { uid: 'a', hajm: 3, narx: null, summa: 0 },
      { uid: 'b', hajm: 2, narx: null, summa: undefined },
    ];
    const rows = f2AggregatsiyaQator(nodes, () => 1);
    expect(rows[0]).toMatchObject({ hajm: 5, summa: 0, summaBor: false });
  });

  it('a zero-or-negative source narx is treated as "no price" (undefined), never coerced to 0', () => {
    const nodes: F2ExactManbaTugun[] = [{ uid: 'a', hajm: 1, narx: 0, summa: 0 }];
    const rows = f2AggregatsiyaQator(nodes, () => 1);
    expect(rows[0].narx).toBeUndefined();
  });

  it('tracks every distinct price seen when merged nodes disagree, but keeps the FIRST as the certified narx', () => {
    const nodes: F2ExactManbaTugun[] = [
      { uid: 'a', hajm: 5, narx: 100, summa: 500 },
      { uid: 'b', hajm: 5, narx: 150, summa: 750 }, // same qator, different price mid-document
    ];
    const rows = f2AggregatsiyaQator(nodes, () => 2);
    expect(rows[0]).toMatchObject({ narx: 100, barchaNarxlar: [100, 150] });
  });

  it('a repeated identical price across merged nodes does not duplicate in barchaNarxlar', () => {
    const nodes: F2ExactManbaTugun[] = [
      { uid: 'a', hajm: 5, narx: 100, summa: 500 },
      { uid: 'b', hajm: 5, narx: 100, summa: 500 },
    ];
    const rows = f2AggregatsiyaQator(nodes, () => 3);
    expect(rows[0].barchaNarxlar).toEqual([100]);
  });
});

describe('F2 exact payload — NEEDS_REVIEW ambiguity guard (never fabricates qty*narx)', () => {
  it('a row with a price but no source summa blocks the whole batch (fail-closed, no partial write)', () => {
    const rows = f2AggregatsiyaQator(
      [
        { uid: 'ok', hajm: 10, narx: 100, summa: 1000 },
        { uid: 'ambiguous', hajm: 5, narx: 50, summa: 0 }, // narx bor, summa yo'q
      ],
      (uid) => (uid === 'ok' ? 1 : 2),
    );
    const natija = f2ExactPayloadQur(rows);
    expect(natija.ok).toBe(false);
    if (!natija.ok) {
      expect(natija.sabab).toBe('NEEDS_REVIEW');
      if (natija.sabab === 'NEEDS_REVIEW') {
        expect(natija.noaniqSoni).toBe(1);
        expect(natija.noaniqQatorIdlar).toEqual([2]);
      }
    }
  });

  it('a row with no price at all is fine (price_intentionally_absent) — not ambiguous', () => {
    const rows = f2AggregatsiyaQator([{ uid: 'a', hajm: 10, narx: null, summa: 0 }], () => 1);
    const natija = f2ExactPayloadQur(rows);
    expect(natija.ok).toBe(true);
    if (natija.ok) {
      expect(natija.qatorlar[0]).toMatchObject({
        qatorId: 1,
        certifiedQuantity: 10,
        certifiedUnitPrice: undefined,
        certifiedAmount: undefined,
        priceIntentionallyAbsent: true,
      });
    }
  });

  it('the central payload builder rejects conflicting source prices before any write payload is returned', () => {
    const rows: F2ExactQator[] = [{
      qator_id: 10,
      hajm: 10,
      narx: 100,
      summa: 1250,
      summaBor: true,
      barchaNarxlar: [100, 150],
    }];
    expect(f2ExactPayloadQur(rows)).toEqual({ ok: false, sabab: 'CONFLICTING_PRICES', qatorIdlar: [10] });
  });

  it('the worked example (qty=10, price=123.45, source amount=1234.49) is carried through verbatim, not recomputed', () => {
    // 10 * 123.45 = 1234.50 -- ONE cent off the real source amount below.
    // The certified amount must stay 1234.49 (the F2 document's own figure),
    // never silently corrected to the arithmetic product.
    const rows = f2AggregatsiyaQator([{ uid: 'a', hajm: 10, narx: 123.45, summa: 1234.49 }], () => 1);
    const natija = f2ExactPayloadQur(rows);
    expect(natija.ok).toBe(true);
    if (natija.ok) {
      expect(natija.qatorlar[0].certifiedAmount).toBe(1234.49);
      expect(natija.qatorlar[0].certifiedQuantity * (natija.qatorlar[0].certifiedUnitPrice ?? 0)).not.toBe(
        natija.qatorlar[0].certifiedAmount,
      );
    }
  });

  /* T2-F2-IMPORT-NARXSIZ-BLOK-001 — haqiqiy Amfiteatr F2 faylining shakli:
     1054 qatordan 164 tasi narxsiz (ЗАТРАТЫ ТРУДА МАШИНИСТОВ, ВОДА...),
     890 tasi to'liq narxlangan. Ilgari `exactWrite` shu 164 tasi uchun
     BUTUN faylni rad etardi. Endi fayl yozilishi SHART. */
  it('haqiqiy fayl naqshi: narxsiz qatorlar aralashgan to\'plam bloklanmaydi, hammasi yoziladi', () => {
    const nodes: F2ExactManbaTugun[] = [
      ...Array.from({ length: 890 }, (_, i) => ({ uid: `narxli${i}`, hajm: 2, narx: 100, summa: 200 })),
      ...Array.from({ length: 164 }, (_, i) => ({ uid: `narxsiz${i}`, hajm: 3.5, narx: 0, summa: 0 })),
    ];
    const rows = f2AggregatsiyaQator(nodes, (uid) => Number(uid.replace(/\D/g, '')) + (uid.startsWith('narxsiz') ? 10000 : 1));
    const natija = f2ExactPayloadQur(rows);
    expect(natija.ok).toBe(true);
    if (natija.ok) {
      expect(natija.qatorlar).toHaveLength(1054);
      const narxsiz = natija.qatorlar.filter((q) => q.priceIntentionallyAbsent);
      expect(narxsiz).toHaveLength(164);
      // Hajm SAQLANADI, pul esa to'qilmaydi.
      expect(narxsiz.every((q) => q.certifiedQuantity === 3.5 && q.certifiedAmount === undefined)).toBe(true);
      expect(natija.qatorlar.filter((q) => q.certifiedAmount === 200)).toHaveLength(890);
    }
  });

  /* Hajm HAR IKKALA bo'lakdan qo'shiladi (10+10=20), pul esa faqat
     birinchisidan (1234.49) -- yig'indi "to'liq"dek ko'rinadi, aslida
     20 birlik uchun 10 birlikning puli. Yozilmasligi shart. */
  it('qisman summa: bo\'laklarning birida pul yo\'q bo\'lsa, yig\'indi buni yashirmaydi', () => {
    const rows = f2AggregatsiyaQator(
      [
        { uid: 'a', hajm: 10, narx: 123.45, summa: 1234.49 },
        { uid: 'b', hajm: 10, narx: 123.45, summa: undefined },
      ],
      () => 123,
    );
    expect(rows[0]).toMatchObject({ hajm: 20, summa: 1234.49, summaBor: true, summasizBolak: 1 });
    const natija = f2ExactPayloadQur(rows);
    expect(natija.ok).toBe(false);
    if (!natija.ok) expect(natija.sabab).toBe('NEEDS_REVIEW');
    expect(f2IstisnolarniAniqla(rows)).toContainEqual({ turi: 'NEEDS_REVIEW', qatorId: 123 });
  });

  it('AMOUNT_WITHOUT_PRICE: summasi bor-u narxi yo\'q qator yozilmaydi (RPC uni null qilib pulni yo\'qotardi)', () => {
    const rows = f2AggregatsiyaQator(
      [
        { uid: 'ok', hajm: 10, narx: 100, summa: 1000 },
        { uid: 'summali-narxsiz', hajm: 5, narx: 0, summa: 750 },
      ],
      (uid) => (uid === 'ok' ? 1 : 2),
    );
    const natija = f2ExactPayloadQur(rows);
    expect(natija.ok).toBe(false);
    if (!natija.ok) {
      expect(natija.sabab).toBe('AMOUNT_WITHOUT_PRICE');
      if (natija.sabab === 'AMOUNT_WITHOUT_PRICE') expect(natija.noaniqQatorIdlar).toEqual([2]);
    }
  });

  it('an all-clear batch maps every row into the v2 RPC shape', () => {
    const rows = f2AggregatsiyaQator(
      [
        { uid: 'a', hajm: 10, narx: 100, summa: 1000 },
        { uid: 'b', hajm: 20, narx: null, summa: null },
      ],
      (uid) => (uid === 'a' ? 1 : 2),
    );
    const natija = f2ExactPayloadQur(rows);
    expect(natija.ok).toBe(true);
    if (natija.ok) {
      expect(natija.qatorlar).toHaveLength(2);
      expect(natija.qatorlar.find((q) => q.qatorId === 1)).toMatchObject({
        certifiedQuantity: 10, certifiedUnitPrice: 100, certifiedAmount: 1000, priceIntentionallyAbsent: false,
      });
      expect(natija.qatorlar.find((q) => q.qatorId === 2)).toMatchObject({
        certifiedQuantity: 20, priceIntentionallyAbsent: true,
      });
    }
  });
});

describe('F2 pre-approval audit — exceptions-only (LRV Control law, Section 3)', () => {
  const clean: F2ExactQator = { qator_id: 1, hajm: 10, narx: 100, summa: 1000, summaBor: true, barchaNarxlar: [100] };

  it('a fully clean row (qty*price == source amount, hajm >= 0) produces zero exceptions', () => {
    expect(f2IstisnolarniAniqla([clean])).toEqual([]);
  });

  it('a sub-tiyin rounding difference is NOT flagged as a mismatch', () => {
    const rows: F2ExactQator[] = [{ ...clean, qator_id: 2, hajm: 3, narx: 33.33, summa: 99.99, barchaNarxlar: [33.33] }]; // 3*33.33=99.99 exact
    expect(f2IstisnolarniAniqla(rows)).toEqual([]);
  });

  it('ARITHMETIC_MISMATCH: qty*price disagrees with the source amount beyond tolerance -- flagged, not blocking', () => {
    // 10 * 123.45 = 1234.50, but the source document says 1234.49 (the owner's own worked example).
    const rows: F2ExactQator[] = [{ qator_id: 3, hajm: 10, narx: 123.45, summa: 1234.49, summaBor: true, barchaNarxlar: [123.45] }];
    const exceptions = f2IstisnolarniAniqla(rows);
    expect(exceptions).toHaveLength(1);
    expect(exceptions[0]).toMatchObject({ turi: 'ARITHMETIC_MISMATCH', qatorId: 3, hisoblangan: 1234.5, hujjatdagi: 1234.49 });
    if (exceptions[0].turi === 'ARITHMETIC_MISMATCH') {
      expect(exceptions[0].farq).toBeCloseTo(0.01, 5);
    }
  });

  it('NEEDS_REVIEW also surfaces in the exception list (price present, no source amount)', () => {
    const rows: F2ExactQator[] = [{ qator_id: 4, hajm: 5, narx: 50, summa: 0, summaBor: false, barchaNarxlar: [50] }];
    expect(f2IstisnolarniAniqla(rows)).toEqual([{ turi: 'NEEDS_REVIEW', qatorId: 4 }]);
  });

  it('NEEDS_REVIEW rows are not also arithmetic-checked (no summa to compare against)', () => {
    const rows: F2ExactQator[] = [{ qator_id: 5, hajm: 5, narx: 50, summa: 0, summaBor: false, barchaNarxlar: [50] }];
    const exceptions = f2IstisnolarniAniqla(rows);
    expect(exceptions.filter((e) => e.turi === 'ARITHMETIC_MISMATCH')).toHaveLength(0);
  });

  it('NEGATIVE_HAJM is flagged independently of price/amount correctness', () => {
    const rows: F2ExactQator[] = [{ qator_id: 6, hajm: -3, narx: 100, summa: -300, summaBor: true, barchaNarxlar: [100] }];
    expect(f2IstisnolarniAniqla(rows)).toEqual([{ turi: 'NEGATIVE_HAJM', qatorId: 6, hajm: -3 }]);
  });

  it('a row with no price at all produces zero exceptions (price_intentionally_absent is a normal state)', () => {
    const rows: F2ExactQator[] = [{ qator_id: 7, hajm: 10, summa: 0, summaBor: false, barchaNarxlar: [] }];
    expect(f2IstisnolarniAniqla(rows)).toEqual([]);
  });

  it('CONFLICTING_PRICES: two different source prices merged into the same qator are flagged with both values', () => {
    // The aggregation itself keeps only the FIRST price (narx: 100), but both prices are tracked.
    const rows: F2ExactQator[] = [{ qator_id: 8, hajm: 10, narx: 100, summa: 1500, summaBor: true, barchaNarxlar: [100, 150] }];
    const exceptions = f2IstisnolarniAniqla(rows);
    expect(exceptions.find((e) => e.turi === 'CONFLICTING_PRICES')).toMatchObject({ turi: 'CONFLICTING_PRICES', qatorId: 8, narxlar: [100, 150] });
  });

  it('a single repeated price across merged nodes is NOT a conflict', () => {
    const rows: F2ExactQator[] = [{ qator_id: 9, hajm: 10, narx: 100, summa: 1000, summaBor: true, barchaNarxlar: [100] }];
    expect(f2IstisnolarniAniqla(rows).filter((e) => e.turi === 'CONFLICTING_PRICES')).toHaveLength(0);
  });

  it('a large batch of clean rows produces an empty exception list -- the whole point of "exceptions only"', () => {
    const rows: F2ExactQator[] = Array.from({ length: 500 }, (_, i) => ({
      qator_id: i + 1, hajm: 1, narx: 10, summa: 10, summaBor: true, barchaNarxlar: [10],
    }));
    expect(f2IstisnolarniAniqla(rows)).toEqual([]);
  });

  it('V3: hujjatda ANIQ yozilgan 0 summa — haqiqiy qiymat (Karting АРМАТУРА), to‘xtatmaydi', () => {
    const rows = f2AggregatsiyaQator([{ uid: 'a', hajm: 1.957, narx: 7936451, summa: 0, summaYozilgan: true }], () => 1);
    expect(rows[0]).toMatchObject({ summaBor: true, summa: 0 });
    const r = f2ExactPayloadQur(rows);
    expect(r.ok && r.qatorlar[0]).toMatchObject({ certifiedAmount: 0, certifiedUnitPrice: 7936451 });
  });

  it('V3: narx 0 va summa 0 (ЗАТРАТЫ ТРУДА МАШИНИСТОВ) — narx ataylab yo‘q, to‘xtatmaydi', () => {
    const rows = f2AggregatsiyaQator([{ uid: 'm', hajm: 71.79, narx: 0, summa: 0, summaYozilgan: true }], () => 1);
    expect(rows[0].summaBor).toBe(false);
    const r = f2ExactPayloadQur(rows);
    expect(r.ok && r.qatorlar[0]).toMatchObject({ priceIntentionallyAbsent: true });
  });
});
