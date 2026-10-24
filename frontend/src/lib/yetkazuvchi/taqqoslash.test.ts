import { describe, expect, it } from 'vitest';
import { noyobTakliflar, qatorniTaqqosla, taqqosla, type Taklif } from './taqqoslash';

const T = (id: number, narx: number | null, muddatKun: number | null = 3, yetkazishNarx: number | null = 0): Taklif => ({ yetkazuvchiId: id, yetkazuvchiNom: 'Y' + id, narx, muddatKun, yetkazishNarx });

describe('taqqoslash', () => {
  it("o'rtacha arifmetik, eng arzon, xabar bor", () => {
    const r = qatorniTaqqosla({ qatorId: 1, nom: 'Armatura', birlik: 'kg', miqdor: 10, takliflar: [T(1, 100), T(2, 120), T(3, 110)] });
    expect(r.ortacha).toBe(110); expect(r.eng?.yetkazuvchiId).toBe(1); expect(r.narxliSoni).toBe(3);
    expect(r.xabar).toContain('3 ta');
  });
  it('narxsiz taklif kirmaydi, 0 haqiqiy', () => {
    const r = qatorniTaqqosla({ qatorId: 1, nom: 'x', birlik: null, miqdor: 1, takliflar: [T(1, null), T(2, 0), T(3, 10)] });
    expect(r.narxliSoni).toBe(2); expect(r.ortacha).toBe(5); expect(r.eng?.yetkazuvchiId).toBe(2);
  });
  it('bitta taklif - xabarsiz; hech narx yo\'q - null (0 emas)', () => {
    expect(qatorniTaqqosla({ qatorId: 1, nom: 'x', birlik: null, miqdor: 1, takliflar: [T(1, 5)] }).xabar).toBeNull();
    const b = qatorniTaqqosla({ qatorId: 1, nom: 'x', birlik: null, miqdor: 1, takliflar: [T(1, null)] });
    expect(b.ortacha).toBeNull(); expect(b.eng).toBeNull();
  });
  it('bir yetkazuvchi ikki marta - oxirgisi; narx teng bo\'lsa muddat kami', () => {
    expect(noyobTakliflar([T(1, 9), T(1, 8)])).toHaveLength(1);
    const r = qatorniTaqqosla({ qatorId: 1, nom: 'x', birlik: null, miqdor: 1, takliflar: [T(1, 5, 7), T(2, 5, 2)] });
    expect(r.eng?.yetkazuvchiId).toBe(2);
  });
  it("yetkazuvchi jami: yetkazish bilan; to'liq bo'lmaganlar oxirida", () => {
    const r = taqqosla([
      { qatorId: 1, nom: 'a', birlik: 'kg', miqdor: 10, takliflar: [T(1, 10, 3, 50), T(2, 9, 5, 0)] },
      { qatorId: 2, nom: 'b', birlik: 'dona', miqdor: 2, takliflar: [T(1, 100, 4, 0), T(2, null)] },
    ]);
    const y1 = r.yetkazuvchilar.find((y) => y.yetkazuvchiId === 1)!;
    expect(y1.jami).toBe(350); expect(y1.toliq).toBe(true); expect(y1.maxMuddatKun).toBe(4);
    const y2 = r.yetkazuvchilar.find((y) => y.yetkazuvchiId === 2)!;
    expect(y2.jami).toBe(90); expect(y2.toliq).toBe(false);
    expect(r.yetkazuvchilar[0].yetkazuvchiId).toBe(1);
    expect(r.xabarlar.length).toBe(1);
  });
});
