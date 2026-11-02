import { describe, expect, it } from 'vitest';
import { ishKeyingiMateriallari, ishMateriallari, materialTaklifi } from './fakt-material-taklif';

const r = (id: number, ota_id: number | null, tur: string, tartib: number, o: Record<string, unknown> = {}) => ({ id, ota_id, tur, tartib, ...o });

describe('ish → keyingi alohida materiallar (Yo‘l 2,5 km)', () => {
  it('bo‘lim ichida tartib bo‘yicha: ish → keyingi ishgacha bo‘lgan mat/ob; ishning o‘z bolasi va oldingi material kirmaydi', () => {
    const rows = [
      r(1, null, 'rz', 1),
      r(9, 1, 'mat', 2),                    // birinchi ishdan oldin — hech kimga tegishli emas
      r(3, 1, 'bl', 5), r(30, 3, 'mat', 1), // o'z bolasi (norma bilan) — bu yerda emas
      r(5, 1, 'bl', 9),
      r(4, 1, 'mat', 6), r(6, 1, 'ob', 7), // tartib bo'yicha 3-ishdan keyin (massiv tartibi ahamiyatsiz)
      r(7, 1, 'mat', 10),
      r(8, 1, 'rz', 11), r(81, 8, 'mat', 1), r(10, 1, 'mat', 12), // ichki bo'lim zanjirni uzadi
    ];
    const m = ishKeyingiMateriallari(rows);
    expect(m.get(3)).toEqual([4, 6]);
    expect(m.get(5)).toEqual([7]);
    expect([...m.keys()].sort()).toEqual([3, 5]);
  });

  it('qo‘shimcha/zamena qatorlar zanjirni buzmaydi va bog‘lanmaydi', () => {
    const rows = [r(1, null, 'rz', 1), r(2, 1, 'bl', 2), r(3, 1, 'bl', 3, { zamena: true }), r(4, 1, 'mat', 4), r(5, 1, 'mat', 5, { qoshimcha: true })];
    expect(ishKeyingiMateriallari(rows).get(2)).toEqual([4]);
  });

  it('ish ichidagi mat/ob bolalari ham ergashadi (rs orqali ham); boshqa ish/qo‘shimcha/zamena orqali emas; avval ichkilar', () => {
    const rows = [
      r(1, null, 'rz', 1),
      r(3, 1, 'bl', 2), r(31, 3, 'mat', 3), r(32, 3, 'rs', 4), r(321, 32, 'ob', 5), r(33, 3, 'rs', 6), r(34, 3, 'mat', 7, { zamena: true }),
      r(4, 1, 'mat', 8),                       // ishdan keyingi alohida
      r(5, 1, 'bl', 9, { qoshimcha: true }), r(51, 5, 'mat', 10),
    ];
    const m = ishMateriallari(rows);
    expect(m.get(3)).toEqual([31, 321, 4]);
    expect(m.has(5)).toBe(false);
  });

  it('taklif asosi: material smetasidan zamena/bajarilmaydi qismi ayriladi', () => {
    expect(materialTaklifi(50, 100, 40, 0, 10)).toBe(15);
    expect(materialTaklifi(50, 100, 40, 0, 40)).toBeNull();
  });

  it('taklif = ish ulushi × material smetasi − material fakti; noma‘lum/chegirma/to‘liq — null', () => {
    expect(materialTaklifi(40, 100, 50, 0)).toBe(20);
    expect(materialTaklifi(40, 100, 50, 15)).toBe(5);
    expect(materialTaklifi(40, 100, 50, 20)).toBeNull();
    expect(materialTaklifi(120, 100, 50, 0)).toBe(60); // hajm bloklanmaydi
    expect(materialTaklifi(0, 100, 50, 0)).toBeNull();
    expect(materialTaklifi(10, null, 50, 0)).toBeNull();
    expect(materialTaklifi(10, 100, null, 0)).toBeNull();
    expect(materialTaklifi(-2, -4, 5, 0)).toBeNull();
  });
});
