import { describe, expect, it } from 'vitest';
import { narxlarniDaraxtgaQoll, narxsizImportHisobi, resNarxIndeksiQur } from '../SmetaYuklaNative';
import { jamiQatorlarYigindisi } from '../../../lib/nakrutka-smetadan';
import { oldindanKorinish, pryamyeTaqqos } from './korinish';
import { muammolarRoyxati } from './xulosa';
import type { AktNode } from '../../../lib/f2-match-engine';

const bos = { lrvTanlanmagan: false, narxsiz: 0, resursJami: 0, vedomostChiqarildi: 0, tekisVaraqlar: [], tushunilmadiVaraq: 0 };
const barg = (uid: string, nom: string, hajm: number): AktNode => ({ uid, type: 'mat', kod: 'С', nom, bir: 'ШТ', hajm });

describe('RES da bir xil nomli, turli narxli qatorlar (ikki xil LED fonar)', () => {
  const res = [
    { kod: 'С', nom: 'LED FONAR', birlik: 'ШТ', narx: 1000 },
    { kod: 'С', nom: 'LED FONAR', birlik: 'ШТ', narx: 900 },
    { kod: 'С', nom: 'QUTI', birlik: 'ШТ', narx: 50 },
  ];

  it('LRV dagi qatorlar soni teng bo‘lsa — RES tartibi bilan juftlanadi (bittasining narxi hammasiga yopishmaydi)', () => {
    const tree: AktNode[] = [{ uid: 'r', type: 'rz', nom: 'B', children: [barg('a', 'LED FONAR', 10), barg('b', 'QUTI', 2), barg('c', 'LED FONAR', 10)] }];
    const q = narxlarniDaraxtgaQoll(tree, resNarxIndeksiQur(res));
    const sum = (q.tree[0].children ?? []).map((x) => x.summa);
    expect(sum).toEqual([10000, 100, 9000]);
  });

  it('soni teng bo‘lmasa eski xatti-harakat: birinchi narx (taxmin kuchaytirilmaydi)', () => {
    const tree: AktNode[] = [{ uid: 'r', type: 'rz', nom: 'B', children: [barg('a', 'LED FONAR', 10), barg('c', 'LED FONAR', 10), barg('d', 'LED FONAR', 10)] }];
    const q = narxlarniDaraxtgaQoll(tree, resNarxIndeksiQur(res));
    expect((q.tree[0].children ?? []).map((x) => x.narx)).toEqual([1000, 1000, 1000]);
  });

  it('bir xil narxli takror — juftlash yoqilmaydi', () => {
    const idx = resNarxIndeksiQur([{ nom: 'X', birlik: 'ШТ', narx: 5 }, { nom: 'X', birlik: 'ШТ', narx: 5 }]);
    expect(idx.kopNarx.size).toBe(0);
  });
});

describe('fayl «прямые» bilan taqqoslash', () => {
  // Sintetik: materiallar + transport «прямые» ga kirgan; ikkinchi transport (kabel) kirmagan.
  const oqish = {
    holat: 'topildi', koeffitsientlar: { 'НДС': 12 },
    qatorlar: [
      { kod: 'pryamye', summa: 2000, masshtab: 1 },
      { kod: 'tr_mat', summa: 100, masshtab: 1000 },
      { kod: 'tr_mat', summa: 40, masshtab: 1000 },
      { kod: 'tr_ob', summa: 10, masshtab: 1000 },
    ],
  };

  it('transport qatorlari «прямые» tarkibida bo‘lsa — farq 0 (kerakli to‘plam topiladi, ortiqchasi tegilmaydi)', () => {
    const f = pryamyeTaqqos(1890, oqish)!; // 2000 − 100 − 10
    expect(Math.abs(f.farq)).toBeLessThan(0.01);
    expect(f.daraja).toBe('mos');
    expect(f.transportKodlari).toEqual(['tr_mat', 'tr_ob']);
  });

  it('daraja chegaralari: ≤0,5 % mos, 0,5–2 % sariq, >2 % tasdiq', () => {
    const oddiy = { holat: 'topildi', koeffitsientlar: {}, qatorlar: [{ kod: 'pryamye', summa: 1000, masshtab: 1 }] };
    expect(pryamyeTaqqos(996, oddiy)!.daraja).toBe('mos');
    expect(pryamyeTaqqos(990, oddiy)!.daraja).toBe('ogoh');
    expect(pryamyeTaqqos(960, oddiy)!.daraja).toBe('tasdiq');
    expect(pryamyeTaqqos(null, oddiy)).toBeNull();
    expect(pryamyeTaqqos(960, null)).toBeNull();
  });

  it('muammolar: sariq — ogoh, katta farq — xato; mos bo‘lsa ro‘yxatda yo‘q', () => {
    const oddiy = { holat: 'topildi', koeffitsientlar: {}, qatorlar: [{ kod: 'pryamye', summa: 1000, masshtab: 1 }] };
    const ton = (s: number) => muammolarRoyxati({ ...bos, pryamyeFarq: pryamyeTaqqos(s, oddiy) }).find((m) => m.kalit === 'pryamye-farq')?.ton;
    expect(ton(999)).toBeUndefined();
    expect(ton(990)).toBe('ogoh');
    expect(ton(900)).toBe('xato');
  });

  it('korinish ob’ektiga ulangan', () => {
    const k = oldindanKorinish([{ type: 'rz', children: [{ type: 'rs', summa: 960 }] }], { holat: 'topildi', koeffitsientlar: {}, qatorlar: [{ kod: 'pryamye', summa: 1000, masshtab: 1 }] });
    expect(k.pryamyeFarq?.daraja).toBe('tasdiq');
  });

  it('formula hisoblanmagan — xato; hisoblangan — ma’lumot', () => {
    expect(muammolarRoyxati({ ...bos, formulaHisoblanmadi: 3 }).find((m) => m.kalit === 'formula-hisoblanmadi')?.ton).toBe('xato');
    expect(muammolarRoyxati({ ...bos, formulaHisoblandi: 65 }).find((m) => m.kalit === 'formula-hisoblandi')?.ton).toBe('info');
  });
});

describe('fayl jami qatorlari bir necha marta uchrasa (METAL TO‘SIQLAR: JAMI va lokal ustuni bir xil son)', () => {
  it('bir xil takror ikki marta sanalmaydi; umumiy + lokallar — umumiy; alohida lokallar — yig‘indi', () => {
    expect(jamiQatorlarYigindisi([2075, 2075])).toBe(2075);
    expect(jamiQatorlarYigindisi([300, 100, 200])).toBe(300);
    expect(jamiQatorlarYigindisi([100, 250, 40])).toBe(390);
    expect(jamiQatorlarYigindisi([7])).toBe(7);
    expect(jamiQatorlarYigindisi([])).toBe(0);
  });
});

describe('narxsiz hisobi: summa bor, birlik narxi yo‘q (БРВ × koeff ekspertiza)', () => {
  it('summasi bor qator narxsiz emas; summasi ham yo‘qi — narxsiz', () => {
    const t: AktNode[] = [{ uid: 'r', type: 'rz', nom: 'B', children: [
      { uid: 'a', type: 'rs', nom: 'ISH', bir: 'SUM', hajm: 2, summa: 80000 },
      { uid: 'b', type: 'rs', nom: 'ISH 2', bir: 'SUM', hajm: 2 },
    ] }];
    expect(narxsizImportHisobi(t)).toMatchObject({ jami: 2, narxsiz: 1 });
  });
});