import { describe, expect, it } from 'vitest';
import { importQoldigi, qoldiqOshishlari, qoralamaBandi } from './band';

describe('F2 hajm nazorati (faqat ko‘rsatish)', () => {
  const lines = [
    { aktId: 1, qatorId: 10, hajm: 3 },
    { aktId: 2, qatorId: 10, hajm: 4 },
    { aktId: 2, qatorId: 11, hajm: null },
  ];

  it('qoralamalarda band — tahrirlanayotgan qoralama o‘zini band qilmaydi', () => {
    expect(qoralamaBandi(lines, null).get(10)).toBe(7);
    expect(qoralamaBandi(lines, 2).get(10)).toBe(3);
    expect(qoralamaBandi(lines, 2).has(11)).toBe(false);
  });

  it('import qoldig‘i = smeta − tasdiqlangan − band; smeta noma’lum — qoldiq yo‘q', () => {
    const q = importQoldigi(new Map([[10, 20], [11, null]]), new Map([[10, 5]]), new Map([[10, 7]]));
    expect(q.get(10)).toBe(8);
    expect(q.has(11)).toBe(false);
  });

  it('oshish: bir smeta qatoriga bir necha qism yig‘iladi; qo‘shimcha/zamena va oshirish belgisi tekshirilmaydi', () => {
    const smeta = new Map<number, number | null>([[10, 10], [12, 5], [13, -4], [14, 1]]);
    const tasd = new Map([[10, 6], [13, -2]]);
    const band = new Map([[10, 2]]);
    const rows = [{ qatorId: 10, hajm: 1 }, { qatorId: 10, hajm: '1.5' }, { qatorId: 12, hajm: 5 }, { qatorId: 13, hajm: -3 }, { qatorId: 14, hajm: 9 }, { qatorId: -1, hajm: 100 }];
    const o = qoldiqOshishlari(rows, smeta, tasd, band, new Set([14]));
    expect(o.map((x) => x.qatorId)).toEqual([10, 13]);
    expect(o[0]).toMatchObject({ smeta: 10, tasdiqlangan: 6, band: 2, shu: 2.5, qoldiq: -0.5 });
    expect(qoldiqOshishlari(rows, smeta, tasd, band, new Set([14]), new Set([10, 13]))).toEqual([]);
  });
});
