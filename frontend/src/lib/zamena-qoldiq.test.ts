import { describe, expect, it } from 'vitest';
import { almashtirilganHajmlar, almashtirilganSumma, almashtirildiMatn, qoldiqHajmi, type ZamenaQator } from './zamena-qoldiq';

const asl = (o: Partial<ZamenaQator> & { id: number }): ZamenaQator => ({ tur: 'rs', birlik: 'm3', hajm: 100, f2Hajm: 0, ...o });
const zam = (o: Partial<ZamenaQator> & { id: number; replaces_line_id: number }): ZamenaQator => ({ tur: 'rs', birlik: 'm3', hajm: 80, change_type: 'REPLACEMENT', progress: 0, ...o });

describe('zamena qoldiq (sintetik)', () => {
  it('birlik bir xil: 1:1 qisman', () => {
    const m = almashtirilganHajmlar([asl({ id: 1 }), zam({ id: 2, replaces_line_id: 1, progress: 30 })]);
    expect(m.get(1)).toBe(30);
    expect(qoldiqHajmi(100, 0, m.get(1))).toBe(70);
  });
  it('birlik farqli, miqdor kiritilmagan: asl to\'liq (o\'z F2 ayriladi)', () => {
    const m = almashtirilganHajmlar([asl({ id: 1, f2Hajm: 20 }), zam({ id: 2, replaces_line_id: 1, birlik: 'kg', hajm: 500 })]);
    expect(m.get(1)).toBe(80);
    expect(qoldiqHajmi(100, 20, m.get(1))).toBe(0);
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
