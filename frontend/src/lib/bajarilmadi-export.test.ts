import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import type { BajarilmadiQator } from '../api/t2-bajarilmadi';
import { bajarilmadiQatorlari, bajarilmadiXlsx } from './bajarilmadi-export';

const y = (id: number, o: Partial<BajarilmadiQator> = {}): BajarilmadiQator => ({
  id, obyekt_id: 8, qator_id: id, kod: 'E' + id, nom: 'Ish ' + id, birlik: 'm3', tur: 'bl', smeta_hajm: 10, fakt_hajm: 3, hajm: null, bajarilmagan_hajm: 7,
  sabab_kod: 'buyurtmachi_chiqardi', sabab_izoh: 'xat № 5', hujjat_id: 9, hujjat_nom: 'xat.pdf', sana: '2026-10-24', zamena_qator_id: null, holat: 'faol', kim: 'Anvar', yaratildi: '2026-10-24T05:00:00Z', ...o,
});

describe('Bajarilmagan hajmlar ro‘yxati', () => {
  it('faqat faol yozuvlar, kod bo‘yicha tartib', () => {
    const r = bajarilmadiQatorlari([y(2), y(1), y(3, { holat: 'bekor' })]);
    expect(r.map((x) => x.id)).toEqual([1, 2]);
  });

  it('Excel: sabab (rus tilida), hajm, dalil hujjat va kim yoziladi', async () => {
    const { bytes, faylNomi, soni } = await bajarilmadiXlsx([y(1), y(2, { sabab_kod: 'zamena', hujjat_nom: null, hujjat_id: null })], { obyektNomi: 'Stella', sana: '2026-10-24' });
    expect(soni).toBe(2); expect(faylNomi).toBe('Nevypolneno_Stella_20261024.xlsx');
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(bytes.buffer as ArrayBuffer);
    const ws = wb.worksheets[0];
    expect(String(ws.getCell('A1').value)).toContain('НЕВЫПОЛНЕННЫХ');
    expect(ws.getCell('H6').value).toBe('Заказчик исключил из проекта');
    expect(ws.getCell('G6').value).toBe(7);
    expect(ws.getCell('J6').value).toBe('xat.pdf');
    expect(ws.getCell('H7').value).toBe('Замена');
    expect(ws.getCell('L6').value).toBe('Anvar');
  });
});
