import { afterEach, describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { dizaynTozala, exceljsJadvalUslubi, hujjatDizayniniSaqla } from '.';
import { bajarilmadiXlsx } from '../bajarilmadi-export';
import { moliyaXlsx } from '../moliya-tahlil';
import type { BajarilmadiQator } from '../../api/t2-bajarilmadi';

afterEach(() => { hujjatDizayniniSaqla(null); });

const y = (id: number): BajarilmadiQator => ({
  id, obyekt_id: 8, qator_id: id, kod: 'E' + id, nom: 'Устройство монолитных фундаментных плит с армированием и бетонированием в опалубке ' + id, birlik: 'м3', tur: 'bl',
  smeta_hajm: 123456789.123, fakt_hajm: 3, hajm: null, bajarilmagan_hajm: 7, sabab_kod: 'zamena', sabab_izoh: null, hujjat_id: null, hujjat_nom: null, sana: '2026-10-24',
  zamena_qator_id: null, holat: 'faol', kim: 'Test', yaratildi: '2026-10-24T05:00:00Z',
} as BajarilmadiQator);

async function oqi(bytes: Uint8Array) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes.buffer as ArrayBuffer);
  return wb.worksheets[0];
}

describe('exceljs eksportlari — hujjat dizayni', () => {
  it('bajarilmadi: jadvalning HAR katagida ramka, sarlavha qalin + fonli + o‘ralgan, nom o‘ralgan va qator balandligi bor', async () => {
    const ws = await oqi((await bajarilmadiXlsx([y(1), y(2)], { obyektNomi: 'Obyekt', sana: '2026-10-24' })).bytes);
    for (let r = 5; r <= 7; r++) for (let c = 1; c <= 12; c++) {
      const b = ws.getCell(r, c).border;
      expect([b?.left?.style, b?.right?.style, b?.top?.style, b?.bottom?.style].every(Boolean)).toBe(true);
    }
    const h = ws.getCell('C5');
    expect(h.font?.bold).toBe(true);
    expect(h.alignment?.wrapText).toBe(true);
    expect(h.fill).toMatchObject({ type: 'pattern' });
    expect(ws.getCell('C6').alignment?.wrapText).toBe(true);
    expect(ws.getRow(6).height ?? 0).toBeGreaterThan(26);
    // eng katta son ('123,456,789.123') ustun eniga sig'adi
    expect(ws.getColumn(5).width ?? 0).toBeGreaterThanOrEqual('123,456,789.123'.length + 1);
    expect(ws.pageSetup.fitToWidth).toBe(1);
  });

  it('kompaniya dizayni qo‘llanadi: shrift va chegara, chekkalar', async () => {
    hujjatDizayniniSaqla(dizaynTozala({ shrift: { nom: 'Arial', olcham: 12 }, chegara: 'medium', chekka: { chap: 1, ong: 1, yuqori: 1, past: 1 } }));
    const ws = await oqi((await bajarilmadiXlsx([y(1)], { obyektNomi: 'Obyekt', sana: '2026-10-24' })).bytes);
    expect(ws.getCell('C6').font?.name).toBe('Arial');
    expect(ws.getCell('C6').font?.size).toBe(12);
    expect(ws.getCell('C6').border?.left?.style).toBe('medium');
    expect(ws.pageSetup.margins?.left).toBe(1);
  });

  it('moliya tahlili: sarlavha va ma’lumot qatorlari ramkali, matn o‘ralgan', async () => {
    const ws = await oqi((await moliyaXlsx({ korsatkichlar: [{ n: 1, kod: 'fakt', qiymat: 1_500_000_000, manba: 'tizim', formula: 'x', qolda: null }] } as never, { qamrovNomi: 'Obyekt', sana: '2026-10-24' })).bytes);
    expect(ws.getCell('B4').font?.bold).toBe(true);
    expect(ws.getCell('B5').border?.bottom?.style).toBe('thin');
    expect(ws.getCell('D5').alignment?.wrapText).toBe(true);
  });

  it('yordamchi qiymatga tegmaydi: son va formula o‘zgarmaydi, o‘z foni saqlanadi', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('T');
    ws.addRow(['Сарлавха', 'Сумма']);
    const r = ws.addRow(['Позиция', 1234567.891]);
    r.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
    ws.addRow(['Итого', { formula: 'B2', result: 1234567.891 }]);
    exceljsJadvalUslubi(ws, { sarlavha: 1, darajalar: new Map([[3, 'vsego']]), pulUstunlari: [2] });
    expect(ws.getCell('B2').value).toBe(1234567.891);
    expect(ws.getCell('B3').value).toMatchObject({ formula: 'B2' });
    expect((ws.getCell('B2').fill as { fgColor?: { argb?: string } }).fgColor?.argb).toBe('FFFFFF00');
    expect(ws.getCell('B3').border?.top?.style).toBe('double');
    expect(ws.getColumn(2).width ?? 0).toBeGreaterThanOrEqual('1,234,567.89'.length + 1);
  });
});
