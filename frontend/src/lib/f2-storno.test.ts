import { describe, expect, it } from 'vitest';
import { faolStornolar, stornoNomzodAktlar, stornoBlokniSaqla, stornoFaktReja, stornoQator, stornoQatorimi, stornoQur, type StornoManbaQator } from './f2-storno';

const manba: StornoManbaQator[] = [
  { qator_id: 1, hajm: 4, certified_quantity: 4, certified_unit_price: 25, certified_amount: 100 },
  { qator_id: 2, hajm: 2.5, certified_quantity: 2.5, certified_unit_price: 10, certified_amount: 25.01 }, // hujjat summasi aynan (arifmetikadan farq)
  { qator_id: 3, hajm: 7, certified_quantity: 7, certified_unit_price: null, certified_amount: null, provenance_status: 'price_intentionally_absent' }, // ish: narxsiz
  { qator_id: 4, hajm: -1, certified_quantity: -1, certified_unit_price: 8, certified_amount: -8 }, // minus qator
  { qator_id: 5, hajm: 0, certified_quantity: 0, certified_unit_price: 5, certified_amount: 3 },
  { qator_id: 6, hajm: 3, certified_quantity: 3, certified_unit_price: 9, certified_amount: null }, // summa noma'lum
];

describe('F2 storno qurish', () => {
  it('hajm va summa minus, narx o‘sha, hujjat summasi aynan', () => {
    const r = stornoQur(manba, 77);
    const by = new Map(r.qatorlar.map((q) => [q.qatorId, q]));
    expect(by.get(1)).toMatchObject({ certifiedQuantity: -4, certifiedUnitPrice: 25, certifiedAmount: -100, priceIntentionallyAbsent: false });
    expect(by.get(2)).toMatchObject({ certifiedQuantity: -2.5, certifiedUnitPrice: 10, certifiedAmount: -25.01 });
    expect(by.get(4)).toMatchObject({ certifiedQuantity: 1, certifiedUnitPrice: 8, certifiedAmount: 8 }); // minusning storno si plyus
    expect(by.get(1)!.rawSnapshot).toMatchObject({ source: 'storno', stornoOf: 77 });
    expect(stornoQatorimi({ raw_snapshot: by.get(1)!.rawSnapshot })).toBe(true);
  });

  it('NULL NULL bo‘lib qoladi: narxsiz qator va noma‘lum summa 0 ga aylanmaydi', () => {
    const r = stornoQur(manba, 77);
    const by = new Map(r.qatorlar.map((q) => [q.qatorId, q]));
    expect(by.get(3)).toMatchObject({ certifiedQuantity: -7, priceIntentionallyAbsent: true });
    expect(by.get(3)!.certifiedAmount).toBeUndefined();
    expect(by.get(3)!.certifiedUnitPrice).toBeUndefined();
    expect(by.get(6)).toMatchObject({ certifiedQuantity: -3, priceIntentionallyAbsent: true });
    expect(by.get(6)!.certifiedAmount).toBeUndefined();
    expect(r.nomalum).toBe(2); // 3 va 6
    expect(r.jami).toBe(-100 - 25.01 + 8); // faqat ma'lum summalar
    expect(Object.is(stornoQator({ qator_id: 9, hajm: 2, certified_unit_price: 0, certified_amount: 0 }, 1).tur === 'qator' ? (stornoQator({ qator_id: 9, hajm: 2, certified_unit_price: 0, certified_amount: 0 }, 1) as { qator: { certifiedAmount?: number } }).qator.certifiedAmount : 1, 0)).toBe(true); // 0 summa -0 emas
  });

  it('hajm 0 qator stornolanmaydi va sanaladi', () => {
    const r = stornoQur(manba, 77);
    expect(r.qatorlar.map((q) => q.qatorId)).not.toContain(5);
    expect(r.nolHajm).toBe(1);
  });

  it('tanlab storno: belgisi olingan qatorlar stornolanmaydi', () => {
    const r = stornoQur(manba, 77, new Set([1, 2]));
    expect(r.qatorlar.map((q) => q.qatorId)).toEqual([1, 2]);
    expect(r.jami).toBe(-125.01);
    expect(r.nomalum).toBe(0);
    expect(stornoQur(manba, 77, new Set()).qatorlar).toEqual([]);
  });
});

describe('storno: fakt ham 0 ga', () => {
  const holat = [
    { qator_id: 1, tur: 'bl', fakt_hajm: 4 },
    { qator_id: 2, tur: 'mat', fakt_hajm: 2.5 },
    { qator_id: 3, tur: 'bl', fakt_hajm: 7 }, // saqlab qolinadi (belgisi olingan)
    { qator_id: 4, tur: 'ob', fakt_hajm: 0 },
    { qator_id: 6, tur: 'rs', fakt_hajm: 3 },
  ];
  it('minus fakt yozuvlari sof faktni 0 ga tushiradi; saqlab qolingan qator fakti tegilmaydi', () => {
    const tanlangan = new Set([1, 2, 4, 6]);
    const r = stornoFaktReja(tanlangan, holat, '12');
    expect(r.yozuvlar.map((y) => [y.qator_id, y.hajm])).toEqual([[1, -4], [2, -2.5]]);
    for (const y of r.yozuvlar) expect(holat.find((h) => h.qator_id === y.qator_id)!.fakt_hajm! as number + y.hajm).toBe(0);
    expect(r.yozuvlar.some((y) => y.qator_id === 3)).toBe(false);
    expect(r.hosila).toBe(1); // rs — faqat BL normasidan
  });
  it('fakt noma‘lum yoki 0 bo‘lsa yozuv yo‘q', () => {
    expect(stornoFaktReja(new Set([1, 2]), [{ qator_id: 1, tur: 'bl', fakt_hajm: null }, { qator_id: 2, tur: 'bl', fakt_hajm: 0 }], '1').yozuvlar).toEqual([]);
  });
});

describe('ikki marta storno himoyasi', () => {
  const reestr = [
    { id: 10, raqam: '5-С', holat: 'qoralama', lifecycle_status: 'draft' },
    { id: 11, raqam: '5-С2', holat: 'bekor', lifecycle_status: 'cancelled' },
    { id: 12, raqam: '6', holat: 'tasdiqlangan', lifecycle_status: 'approved' },
  ];
  it('faol storno topiladi, bekor qilingani hisobga olinmaydi', () => {
    expect(faolStornolar([10, 11], reestr).map((a) => a.id)).toEqual([10]);
    expect(faolStornolar([11], reestr)).toEqual([]);
    expect(faolStornolar([], reestr)).toEqual([]);
  });
});

describe('qoralamani qayta saqlashda storno bloki', () => {
  const saqlangan = [
    { qator_id: 1, certified_quantity: -4, certified_unit_price: 25, certified_amount: -100, raw_snapshot: { source: 'storno', stornoOf: 3 } },
    { qator_id: 2, certified_quantity: 5, certified_unit_price: 1, certified_amount: 5, raw_snapshot: { source: 'native_f2_preparation' } },
  ];
  it('storno qatorlari boshida aynan o‘zi bilan, yangilari ostida; oddiy qatorlar almashtiriladi', () => {
    const r = stornoBlokniSaqla(saqlangan, [{ qatorId: 20 }, { qatorId: 21 }]);
    expect(r.qatorlar.map((q) => q.qatorId)).toEqual([1, 20, 21]);
    expect(r.qatorlar[0]).toMatchObject({ certifiedQuantity: -4, certifiedUnitPrice: 25, certifiedAmount: -100 });
    expect(r.stornoSoni).toBe(1);
  });
  it('storno bilan bir xil pozitsiyadagi yangi qator tashlanadi', () => {
    const r = stornoBlokniSaqla(saqlangan, [{ qatorId: 1 }, { qatorId: 20 }]);
    expect(r.qatorlar.map((q) => q.qatorId)).toEqual([1, 20]);
    expect(r.toqnashdi).toBe(1);
  });
  it('narxsiz storno qatori narxsiz qoladi', () => {
    const r = stornoBlokniSaqla([{ qator_id: 9, certified_quantity: -2, provenance_status: 'price_intentionally_absent', raw_snapshot: { source: 'storno' } }], []);
    expect(r.qatorlar[0]).toMatchObject({ priceIntentionallyAbsent: true });
    expect((r.qatorlar[0] as { certifiedAmount?: number }).certifiedAmount).toBeUndefined();
  });
});

describe('storno tanlagichi nomzodlari', () => {
  it('bekor, rad, superseded va F2 emas aktlar chiqmaydi; yangisi tepada', () => {
    const r = [
      { id: 1, tur: 'f2', holat: 'tasdiqlangan', lifecycle_status: 'approved' as const },
      { id: 2, tur: 'f2', holat: 'bekor', lifecycle_status: 'cancelled' as const },
      { id: 3, tur: 'f2', holat: 'qoralama', lifecycle_status: 'rejected' as const },
      { id: 4, tur: 'f2', holat: 'tasdiqlangan', lifecycle_status: 'superseded' as const },
      { id: 5, tur: 'f2', holat: 'qoralama', lifecycle_status: 'draft' as const },
      { id: 6, tur: 'boshqa', holat: 'qoralama' },
    ];
    expect(stornoNomzodAktlar(r).map((a) => a.id)).toEqual([5, 1]);
  });
});
