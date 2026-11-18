import { describe, expect, it } from 'vitest';
import { izohHolatiniTop, kalitId, solishtir, type FaylQator, type QoralamaQator } from './f2-texnadzor-solishtir';
import { sonQil, solishtirHisobotiXlsx, texnadzorFaylOqi } from './f2-texnadzor-oqi';

const f = (o: Partial<FaylQator>): FaylQator => ({ qator: 3, shifr: '', nom: 'Test', tip: 'bl', hajm: 1, narx: 10, summa: 10, kalit: null, izoh: '', rang: null, ...o });
const d = (o: Partial<QoralamaQator>): QoralamaQator => ({ id: 1, kod: 'A-1', nom: 'Test', tur: 'bl', hajm: 1, narx: 10, ...o });

describe('kalitId', () => {
  it('raqamli kalitni o‘qiydi', () => {
    expect(kalitId('123:abcd')).toBe(123);
    expect(kalitId('abc')).toBeNull();
    expect(kalitId('')).toBeNull();
    expect(kalitId(null)).toBeNull();
  });
});

describe('solishtir holatlari', () => {
  it('TENG, HAJM_FARQ, NARX_FARQ, TIZIMDA_YOQ', () => {
    const fayl = [f({ kalit: '1:x' }), f({ kalit: '2:x', hajm: 5 }), f({ kalit: '3:x', narx: 99 }), f({ kalit: '4:x' })];
    const dr = [d({ id: 1 }), d({ id: 2 }), d({ id: 3 })];
    const { qatorlar } = solishtir(fayl, dr);
    expect(qatorlar.map((x) => x.holat)).toEqual(['TENG', 'HAJM_FARQ', 'NARX_FARQ', 'TIZIMDA_YOQ']);
  });

  it('FAYLDA_YOQ: qoralamada bor, faylda yo‘q (nol hajm va RZ tashlanadi)', () => {
    const { qatorlar, xulosa } = solishtir([f({ kalit: '1:x' })], [d({ id: 1 }), d({ id: 2, kod: 'B' }), d({ id: 3, hajm: 0 }), d({ id: 4, tur: 'rz' })]);
    expect(qatorlar.filter((x) => x.holat === 'FAYLDA_YOQ').map((x) => x.id)).toEqual([2]);
    expect(xulosa.bizning).toBe(1);
  });

  it('KALITSIZ qator shifr+hajm bo‘yicha qoralamadan topiladi (kiritilgan)', () => {
    const fayl = [f({ kalit: '1:x' }), f({ kalit: null, shifr: 'Z-9', nom: 'Yangi ish', hajm: 7 })];
    const { qatorlar, xulosa } = solishtir(fayl, [d({ id: 1 }), d({ id: 9, kod: 'z-9', hajm: 7 })]);
    const k = qatorlar[1];
    expect(k).toMatchObject({ holat: 'KALITSIZ', kiritilgan: true, id: 9, chip: 'bajarildi' });
    expect(qatorlar.some((x) => x.holat === 'FAYLDA_YOQ')).toBe(false);
    expect(xulosa.bajarildi).toBe(1);
  });

  it('KALITSIZ topilmasa — yangi; sarlavha va jami qatorlari tashlanadi', () => {
    const fayl = [f({ kalit: null, shifr: 'Q-1', hajm: 3 }), f({ kalit: null, nom: 'ИТОГО по разделу', hajm: null, narx: null, summa: 5 }), f({ kalit: null, nom: 'Раздел', hajm: null, narx: null })];
    const { qatorlar, xulosa } = solishtir(fayl, []);
    expect(qatorlar).toHaveLength(1);
    expect(xulosa.yangi).toBe(1);
  });

  it('xulosa faqat BL/MAT/OB va qo‘shilgan qatorlarni sanaydi; RS kulrang belgisi bor', () => {
    const fayl = [f({ kalit: '1:x', hajm: 2 }), f({ kalit: '2:x', tip: 'rs', hajm: 2 })];
    const { qatorlar, xulosa } = solishtir(fayl, [d({ id: 1 }), d({ id: 2, tur: 'rs' })]);
    expect(qatorlar[1].rs).toBe(true);
    expect(xulosa.bizning).toBe(1);
  });
});

describe('izoh holati', () => {
  it('o‘zgargan yoki olib tashlangan — Bajarildi', () => {
    expect(izohHolatiniTop('ўзгартиринг', 'HAJM_FARQ')).toBe('BAJARILDI');
    expect(izohHolatiniTop('олиб ташланг', 'TIZIMDA_YOQ')).toBe('BAJARILDI');
    expect(izohHolatiniTop('нарх', 'NARX_FARQ')).toBe('BAJARILDI');
  });
  it('«олиб/қилинмаган» da faqat hajm o‘zgargan — OCHIQ', () => {
    expect(izohHolatiniTop('Бажарилмаган, олиб ташлансин', 'HAJM_FARQ')).toBe('OCHIQ');
  });
  it('o‘zgarmagan: hujjat talabi — Hujjat kerak; o‘zgartirish talabi — OCHIQ', () => {
    expect(izohHolatiniTop('лаборатория хулосаси керак', 'TENG')).toBe('HUJJAT_KERAK');
    expect(izohHolatiniTop('сертификат', 'TENG')).toBe('HUJJAT_KERAK');
    expect(izohHolatiniTop('камайтиринг', 'TENG')).toBe('OCHIQ');
    expect(izohHolatiniTop('сертификат, олиб ташланг', 'TENG')).toBe('OCHIQ');
  });
  it('izoh yo‘q — null', () => { expect(izohHolatiniTop('  ', 'TENG')).toBeNull(); });
  it('izohli qator chipi izoh holatiga qarab', () => {
    const { qatorlar, xulosa } = solishtir([f({ kalit: '1:x', izoh: 'сертификат' }), f({ kalit: '2:x', izoh: 'камайтиринг' })], [d({ id: 1 }), d({ id: 2 })]);
    expect(qatorlar.map((x) => x.chip)).toEqual(['hujjat', 'ochiq']);
    expect(xulosa).toMatchObject({ hujjat: 1, ochiq: 1 });
  });
});

describe('xlsx o‘qish', () => {
  it('sonQil matn va formula natijasini o‘qiydi', () => {
    expect(sonQil('1 234,5')).toBe(1234.5);
    expect(sonQil({ formula: 'A1', result: 4 })).toBe(4);
    expect(sonQil('abc')).toBeNull();
  });

  it('eksportga o‘xshash faylni o‘qiydi: kalit, izoh, rang, qo‘shilgan qator; hisobot yoziladi', async () => {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('F2');
    ws.addRow(['№', 'Шифр', 'Наименование', 'Ед.', 'Количество', '', 'Стоимость', '', 'Тип', 'Кат.', 'КАЛИТ', 'Izoh']);
    ws.addRow(['', '', '', '', 'на единицу', 'по проекту', 'на ед.', 'общая']);
    ws.addRow([1, 'A-1', 'Ish', 'м2', 1, 4, 10, 40, 'bl', '', '5:abc', 'сертификат']);
    ws.getCell('C3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
    ws.addRow([2, 'B-2', 'Qo‘shilgan', 'м2', 1, 2, 10, 20, '', '', '', '']);
    const buf = await wb.xlsx.writeBuffer();
    const qator = await texnadzorFaylOqi(new Uint8Array(buf));
    const { qatorlar } = solishtir(qator ?? [], [{ id: 5, kod: 'A-1', nom: 'Ish', tur: 'bl', hajm: 4, narx: 10 }]);
    expect(qatorlar).toHaveLength(2);
    expect(qatorlar[0]).toMatchObject({ holat: 'TENG', izoh: 'сертификат', rang: 'FFFF00', chip: 'hujjat' });
    expect(qatorlar[1]).toMatchObject({ holat: 'KALITSIZ', chip: 'yangi' });
    const xlsx = await solishtirHisobotiXlsx(qatorlar, ['a', 'b'], (n) => n.holat);
    expect(xlsx.length).toBeGreaterThan(100);
  });

  it('КАЛИТ sarlavhasiz fayl — null', async () => {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('x').addRow(['a', 'b']);
    expect(await texnadzorFaylOqi(new Uint8Array(await wb.xlsx.writeBuffer()))).toBeNull();
  });
});
