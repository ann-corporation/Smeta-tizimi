import { describe, expect, it } from 'vitest';
import { notaMatn, rangHex, texnadzorAslOqi } from './f2-texnadzor-asl';

describe('f2-texnadzor-asl', () => {
  it('rangHex: argb, mavzu va tint', () => {
    expect(rangHex({ argb: 'FFFFFF00' })).toBe('FFFF00');
    expect(rangHex({ theme: 1 })).toBe('000000');
    expect(rangHex({ theme: 4, tint: 0.5 })).toBe('A2B9E2');
    expect(rangHex({ theme: 4, tint: -0.5 })).toBe('223962');
    expect(rangHex(undefined)).toBeNull();
  });

  it('notaMatn: satr va matn bo‘laklari', () => {
    expect(notaMatn('  salom ')).toBe('salom');
    expect(notaMatn({ texts: [{ text: 'a' }, { text: 'b' }] })).toBe('ab');
    expect(notaMatn(null)).toBe('');
  });

  it('fayldagi rang, shrift, izoh va note aynan o‘qiladi', async () => {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('F2');
    ws.addRow(['№', 'Шифр', 'Наименование', 'Ед.', 'x', 'Кол', 'Цена', 'Сумма', 'Тип', 'Кат.', 'КАЛИТ', 'Izoh']);
    ws.addRow([1, 'A-1', 'Ish', 'м2', '', 4, 10, 40, 'bl', '', '5:abc', 'serifikat']);
    ws.addRow([2, 'B-2', 'Toza', 'м2', '', 1, 1, 1, 'bl', '', '6:def', '']);
    ws.getCell('C2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
    ws.getCell('F2').fill = { type: 'pattern', pattern: 'solid', fgColor: { theme: 5, tint: 0.4 } as never };
    ws.getCell('G2').font = { color: { argb: 'FFFF0000' }, bold: true, strike: true, italic: true };
    ws.getCell('F2').note = 'qayta tekshiring';
    const a = await texnadzorAslOqi(new Uint8Array(await wb.xlsx.writeBuffer()));
    expect(a).not.toBeNull();
    expect(a?.sarlavhaQator).toBe(1);
    expect(a?.kalitUstun).toBe(11);
    const q = a!.qatorlar;
    expect(q).toHaveLength(2);
    expect(q[0].qator).toBe(2);
    expect(q[0].katak).toHaveLength(12);
    expect(q[0].katak[2]).toMatchObject({ v: 'Ish', fon: 'FFFF00' });
    expect(q[0].katak[5]).toMatchObject({ v: '4', nota: 'qayta tekshiring' });
    expect(q[0].katak[5].fon).toMatch(/^[0-9A-F]{6}$/);
    expect(q[0].katak[6]).toMatchObject({ v: '10', rang: 'FF0000', qalin: true, kursiv: true, chizilgan: true });
    expect(q[0].katak[11].v).toBe('serifikat');
    expect(q[0].belgili).toBe(true);
    expect(q[1].belgili).toBe(false);
  });

  it('КАЛИТ sarlavhasiz fayl — null', async () => {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('x').addRow(['a']);
    expect(await texnadzorAslOqi(new Uint8Array(await wb.xlsx.writeBuffer()))).toBeNull();
  });
});
