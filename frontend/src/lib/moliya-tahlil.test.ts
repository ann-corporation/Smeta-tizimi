import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { MOLIYA_NOM, mlrd, mlrdOqi, moliyaXlsx, type MoliyaManba, type MoliyaTahlilJavob } from './moliya-tahlil';

const KODLAR = ['fakt', 'f2', 'f2_kutilgan', 'f2_qilinmagan', 'tushgan', 'f2_tushgan_farq', 'fakt_tushgan_farq', 'sarf', 'qarz', 'umumiy_sarf',
  'yakunlash_talab', 'bajarilgan_xarajat_farq', 'tugatish_farq', 'yakuniy_xarajat', 'qmi', 'yakuniy_farq'];

describe('moliya-tahlil (sintetik)', () => {
  it('mlrd: null → «—» (0 emas), 2 xona', () => {
    expect(mlrd(null)).toBe('—');
    expect(mlrd(undefined)).toBe('—');
    expect(mlrd(271_800_000_000).replace(/\s/g, '')).toBe('271,80');
    expect(mlrd(0)).toBe('0,00');
  });
  it('mlrdOqi: vergul/nuqta, bo‘sh → null, xato → undefined', () => {
    expect(mlrdOqi('37,16')).toBe(37_160_000_000);
    expect(mlrdOqi(' 40.6 ')).toBe(40_600_000_000);
    expect(mlrdOqi('-14,16')).toBe(-14_160_000_000);
    expect(mlrdOqi('')).toBeNull();
    expect(mlrdOqi('abc')).toBeUndefined();
  });
  it('16 ko‘rsatkich nomi bor', () => {
    for (const k of KODLAR) expect(MOLIYA_NOM[k]?.ru).toBeTruthy();
  });
  it('Excel: egasi tartibida, RU, null bo‘sh katak', async () => {
    const j: MoliyaTahlilJavob = {
      ok: true, generated_at: '2026-10-27T00:00:00Z', qqs: 'bilan', qamrov: { kompaniya_id: 1, obyekt_id: null, obyektlar: [1] },
      korsatkichlar: KODLAR.map((kod, i) => ({ n: i + 1, kod, qiymat: kod === 'qarz' ? null : (i + 1) * 1e9, formula: 'f', manba: (kod === 'qmi' ? 'qolda' : 'tizim') as MoliyaManba,
        qolda: kod === 'qmi' ? { qiymat: 1, sana: '2026-10-27', kim: 'Anvar', izoh: null, yaratildi: '' } : null })).reverse(),
      obyekt_yoyilma: null, zanjir_xato_soni: 0,
    };
    const { bytes, faylNomi } = await moliyaXlsx(j, { qamrovNomi: 'Park', sana: '2026-10-27' });
    expect(faylNomi).toBe('Finansovyy_analiz_Park_20261027.xlsx');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes.buffer as ArrayBuffer);
    const ws = wb.worksheets[0];
    expect(ws.getRow(5).getCell(1).value).toBe(1);
    expect(ws.getRow(5).getCell(2).value).toBe(MOLIYA_NOM.fakt.ru);
    expect(ws.getRow(5).getCell(3).value).toBe(1);
    expect(ws.getRow(13).getCell(3).value).toBeNull(); // 9 — qarz noma'lum
    expect(ws.getRow(19).getCell(5).value).toBe('Вручную');
    expect(ws.getRow(19).getCell(6).value).toBe('2026-10-27 · Anvar');
  });
});
