import { describe, expect, it } from 'vitest';
import { almashtirilganHajmlar, almashtirilganSumma, almashtirildiMatn, qoldiqHajmi, qoralamaAlmashtirilgan, type ZamenaQator } from './zamena-qoldiq';

const asl = (o: Partial<ZamenaQator> & { id: number }): ZamenaQator => ({ tur: 'rs', birlik: 'm3', hajm: 100, f2Hajm: 0, ...o });
const zam = (o: Partial<ZamenaQator> & { id: number; replaces_line_id: number }): ZamenaQator => ({ tur: 'rs', birlik: 'm3', hajm: 80, change_type: 'REPLACEMENT', progress: 0, ...o });

describe('zamena qoldiq (sintetik)', () => {
  it('birlik bir xil: 1:1 qisman', () => {
    const m = almashtirilganHajmlar([asl({ id: 1 }), zam({ id: 2, replaces_line_id: 1, progress: 30 })]);
    expect(m.get(1)).toBe(30);
    expect(qoldiqHajmi(100, 0, m.get(1))).toBe(70);
  });
  it('birlik farqli, miqdor kiritilmagan: bajarilgan ulushda (boshlanmagan -> 0)', () => {
    expect(almashtirilganHajmlar([asl({ id: 1, f2Hajm: 20 }), zam({ id: 2, replaces_line_id: 1, birlik: 'kg', hajm: 500 })]).get(1)).toBeUndefined();
    const m = almashtirilganHajmlar([asl({ id: 1, f2Hajm: 20 }), zam({ id: 2, replaces_line_id: 1, birlik: 'kg', hajm: 500, progress: 200 })]);
    expect(m.get(1)).toBe(40);
    expect(qoldiqHajmi(100, 20, m.get(1))).toBe(40);
  });
  it('birlik farqli, miqdor kiritilgan: proporsional', () => {
    const m = almashtirilganHajmlar([asl({ id: 1 }), zam({ id: 2, replaces_line_id: 1, birlik: 'kg', hajm: 500, almashtirish_hajm: 40, progress: 250 })]);
    expect(m.get(1)).toBe(20);
  });
  it('bir aslga bir necha zamena: yig\'indi, ortiqchasi qoldiq bilan cheklanadi', () => {
    const rows = [asl({ id: 1 }), zam({ id: 2, replaces_line_id: 1, hajm: 60, progress: 30 }), zam({ id: 3, replaces_line_id: 1, hajm: 50, progress: 20 })];
    expect(almashtirilganHajmlar(rows).get(1)).toBe(50);
    rows[2] = zam({ id: 3, replaces_line_id: 1, hajm: 50, progress: 100 });
    expect(almashtirilganHajmlar(rows).get(1)).toBe(100);
  });
  it('zamenasiz qator va NULL smeta: qoplash yo\'q, NULL != 0', () => {
    expect(almashtirilganHajmlar([asl({ id: 1 })]).size).toBe(0);
    expect(qoldiqHajmi(null, 0, 5)).toBeNull();
  });
  it('ish almashtirilsa bola resurs shu ulushda yopiladi; asl qatorlar o\'zgarmaydi', () => {
    const rows: ZamenaQator[] = [asl({ id: 1, tur: 'bl', hajm: 10 }), asl({ id: 2, ota_id: 1, birlik: 'kg', hajm: 20 }), zam({ id: 3, replaces_line_id: 1, tur: 'bl', hajm: 10, progress: 5 })];
    const nusxa = JSON.parse(JSON.stringify(rows));
    const m = almashtirilganHajmlar(rows);
    expect(m.get(1)).toBe(5); expect(m.get(2)).toBe(10);
    expect(rows).toEqual(nusxa);
  });
  it('summa to\'qilmaydi va matn', () => {
    expect(almashtirilganSumma(30, 100, 10, 1000)).toBe(300);
    expect(almashtirilganSumma(30, 100, null, 1000)).toBe(300);
    expect(almashtirilganSumma(30, 100, null, null)).toBeNull();
    expect(almashtirilganSumma(0, null, null, null)).toBe(0);
    expect(almashtirildiMatn(30, 100, 'm3')).toBe('30 / 100 m3');
    expect(almashtirildiMatn(0, 100, 'm3')).toBeNull();
  });
});

describe('shu qoralamadagi zamena aslning qoldigini kamaytiradi', () => {
  const q = (id: number, o: object = {}) => ({ id, hajm: 100, birlik: 'm3', tur: 'rs', ...o });
  const xar = (...e: Array<[number, number]>) => new Map(e);
  it('birlik bir xil: shu F2 hajmi 1:1 ayriladi', () => {
    const m = qoralamaAlmashtirilgan([q(1), q(2, { hajm: 80 })], xar([2, 1]), xar(), xar(), xar([2, 30]), xar());
    expect(m.get(1)).toBe(30);
  });
  it('aslning qoldigidan oshmaydi (С310-1005: zamena 2138 > asl 1264)', () => {
    const m = qoralamaAlmashtirilgan([q(1, { hajm: 1264.792, birlik: 'т' }), q(2, { hajm: 2138.07, birlik: 'т' })], xar([2, 1]), xar(), xar(), xar([2, 2138.07]), xar());
    expect(m.get(1)).toBeCloseTo(1264.792, 6);
    expect(qoldiqHajmi(1264.792, 0, m.get(1))).toBeCloseTo(0, 6);
  });
  it('server progressi bilan qoshiladi: yozilgani ayrilib qolgan qismi bilan cheklanadi', () => {
    // zamena: server 20 + shu 50; asl 100, serverAlm 20 -> kutilayotgan 50
    const m = qoralamaAlmashtirilgan([q(1), q(2, { hajm: 200 })], xar([2, 1]), xar(), xar([2, 20]), xar([2, 50]), xar([1, 20]));
    expect(m.get(1)).toBe(50);
    // shu F2 80 bo'lsa 80 emas, qolgan 80 (100-20) ga teng; 90 bo'lsa 80 bilan cheklanadi
    expect(qoralamaAlmashtirilgan([q(1), q(2, { hajm: 200 })], xar([2, 1]), xar(), xar([2, 20]), xar([2, 90]), xar([1, 20])).get(1)).toBe(80);
  });
  it('birlik farqli: miqdor bo\'yicha proporsional, miqdorsiz - aslning ulushi', () => {
    const rows = [q(1), q(2, { hajm: 500, birlik: 'kg' })];
    expect(qoralamaAlmashtirilgan(rows, xar([2, 1]), xar([2, 40]), xar(), xar([2, 250]), xar()).get(1)).toBe(20);
    expect(qoralamaAlmashtirilgan(rows, xar([2, 1]), xar(), xar(), xar([2, 200]), xar()).get(1)).toBe(40);
  });
  it('shu F2 da zamena yo\'q yoki bog\'lanmagan: bo\'sh', () => {
    expect(qoralamaAlmashtirilgan([q(1), q(2)], xar([2, 1]), xar(), xar(), xar(), xar()).size).toBe(0);
    expect(qoralamaAlmashtirilgan([q(1), q(2)], xar(), xar(), xar(), xar([2, 30]), xar()).size).toBe(0);
  });
  it('ish zamenasi: bola resurs shu ulushda yopiladi', () => {
    const rows = [q(1, { tur: 'bl', hajm: 10 }), q(2, { ota_id: 1, birlik: 'kg', hajm: 20 }), q(3, { tur: 'bl', hajm: 10 })];
    const m = qoralamaAlmashtirilgan(rows, xar([3, 1]), xar(), xar(), xar([3, 5]), xar());
    expect(m.get(1)).toBe(5); expect(m.get(2)).toBe(10);
  });
});