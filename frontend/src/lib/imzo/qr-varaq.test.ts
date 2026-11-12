// @vitest-environment node
import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { unzipSync, unzlibSync } from 'fflate';
import { imzoVaraqQosh, sanaMatni, tekshiruvHavolasi, tomonYorligi, type ImzoBlokQator } from './qr-varaq';
import { crc32, qrMatritsa, qrPng } from './qr';
import { hujjatMazmunXeshi, xlsxKanonik } from './mazmun';

async function asl() {
  const wb = new ExcelJS.Workbook();
  const v = wb.addWorksheet('F2');
  v.addRow(['Kod', 'Nom', 'Hajm', 'Summa']); v.addRow(['A-1', 'Beton', 12.5, { formula: 'C2*1000', result: 12500 }]);
  return new Uint8Array(await wb.xlsx.writeBuffer());
}
const q = (o: Partial<ImzoBlokQator> = {}): ImzoBlokQator => ({ tomon: 'pudratchi', nomidan_tomon: null, kompaniya: 'Test Pudrat MChJ', fio: 'Test Imzochi', rol: 'pto', usul: 'tizim',
  vaqt: '2026-12-18T09:30:00.123Z', kod: 'AB123-CD456', token: 'T'.repeat(22), ...o });
const talab = (imzolar: ImzoBlokQator[], kutilmoqda: ImzoBlokQator['tomon'][] = []) => ({ imzolar, kutilmoqda, origin: 'https://smeta-tizimi.pages.dev', mazmunXesh: 'cd'.repeat(32) });

describe('QR', () => {
  it('matritsa kvadrat va deterministik; PNG imzosi, o\'lchami va CRC to\'g\'ri', () => {
    const m = qrMatritsa('https://smeta-tizimi.pages.dev/t/' + 'T'.repeat(22));
    expect(m.length).toBeGreaterThanOrEqual(21); expect(m.every((r) => r.length === m.length)).toBe(true);
    // finder pattern (yuqori-chap 7x7 ramka)
    expect(m[0].slice(0, 7).every(Boolean)).toBe(true); expect(m[6].slice(0, 7).every(Boolean)).toBe(true);
    const { png, piksel } = qrPng('abc');
    expect([...png.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const dv = new DataView(png.buffer, png.byteOffset);
    expect(dv.getUint32(16)).toBe(piksel); expect(dv.getUint32(20)).toBe(piksel);
    let o = 8; let idat: Uint8Array | null = null;
    while (o < png.length) {
      const n = dv.getUint32(o); const tur = String.fromCharCode(...png.slice(o + 4, o + 8));
      expect(dv.getUint32(o + 8 + n), tur).toBe(crc32(png.slice(o + 4, o + 8 + n)));
      if (tur === 'IDAT') idat = png.slice(o + 8, o + 8 + n);
      o += 12 + n;
    }
    expect(unzlibSync(idat!).length).toBe((piksel + 1) * piksel);
  });
});

describe('IMZO varag\'i xlsx ga', () => {
  it('Excel ochadigan to\'g\'ri xlsx: varaq oxirida, qatorlar, QR rasmlari, kutilayotgan tomon qatori', async () => {
    const b = imzoVaraqQosh(await asl(), talab([q(), q({ tomon: 'texnadzor', nomidan_tomon: 'buyurtmachi', kompaniya: 'Nazorat MChJ', fio: 'Ikkinchi Odam', token: 'U'.repeat(22) })], ['buyurtmachi']))!;
    expect(b).not.toBeNull();
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(b as never);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['F2', 'IMZO']);
    const w = wb.getWorksheet('IMZO')!;
    expect(w.getImages()).toHaveLength(2);
    const matn: string[] = []; w.eachRow((r) => r.eachCell((c) => matn.push(String(c.value))));
    const hammasi = matn.join('\n');
    expect(hammasi).toContain('Test Pudrat MChJ'); expect(hammasi).toContain('Test Imzochi'); expect(hammasi).toContain('Elektron imzolangan');
    expect(hammasi).toContain('Texnik nazorat (Buyurtmachi nomidan)'); expect(hammasi).toContain('Технадзор (от имени Заказчика)'); expect(hammasi).toContain('Nazorat MChJ');
    expect(hammasi).toContain('Imzo kutilmoqda'); expect(hammasi).toContain('Buyurtmachi');
    expect(hammasi).toContain('smeta-tizimi.pages.dev/t/' + 'T'.repeat(22)); expect(hammasi).toMatch(/[0-9A-Z]{5}-[0-9A-Z]{5}/);
    expect(w.getCell('A1').font?.bold).toBe(true);   // uslub qo'shildi
  });

  it('imzo varag\'i mazmun xeshini va asosiy varaq kataklarini O\'ZGARTIRMAYDI; qayta imzolash eskisini almashtiradi', async () => {
    const a = await asl();
    const b1 = imzoVaraqQosh(a, talab([q()]))!;
    const b2 = imzoVaraqQosh(b1, talab([q(), q({ token: 'V'.repeat(22), fio: 'Yana Biri' })], ['buyurtmachi']))!;
    expect(await hujjatMazmunXeshi(b1)).toBe(await hujjatMazmunXeshi(a));
    expect(await hujjatMazmunXeshi(b2)).toBe(await hujjatMazmunXeshi(a));
    expect(xlsxKanonik(b2)!.varaqlar.map((v) => v.nom)).toEqual(['F2']);
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(b2 as never);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['F2', 'IMZO']);          // ikkita IMZO emas
    expect(wb.getWorksheet('IMZO')!.getImages()).toHaveLength(2);
    expect(Object.keys(unzipSync(b2)).filter((k) => k.includes('imzoqr'))).toHaveLength(2);
    expect(wb.getWorksheet('F2')!.getCell('D2').value).toMatchObject({ formula: 'C2*1000' });
  });

  it('manba QR: imzosiz ham beriladi (faqat manba bloki), QR rasmi bor va mazmun xeshi o\'zgarmaydi', async () => {
    const a = await asl();
    const b = imzoVaraqQosh(a, { ...talab([]), manbaToken: 'M'.repeat(22) })!;
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(b as never);
    const w = wb.getWorksheet('IMZO')!;
    expect(w.getImages()).toHaveLength(1);
    const matn: string[] = []; w.eachRow((r) => r.eachCell((c) => matn.push(String(c.value))));
    expect(matn.join('\n')).toContain('Hujjat manbasi'); expect(matn.join('\n')).toContain('/t/' + 'M'.repeat(22));
    expect(await hujjatMazmunXeshi(b)).toBe(await hujjatMazmunXeshi(a));
    const c = imzoVaraqQosh(b, { ...talab([q()]), manbaToken: 'M'.repeat(22) })!;       // keyin imzo qo\'shilsa: manba + imzo QR
    const wc = new ExcelJS.Workbook(); await wc.xlsx.load(c as never);
    expect(wc.getWorksheet('IMZO')!.getImages()).toHaveLength(2);
  });

  it('xlsx bo\'lmagan fayl - null; yordamchilar', () => {
    expect(imzoVaraqQosh(new TextEncoder().encode('pdf'), talab([q()]))).toBeNull();
    expect(tomonYorligi('texnadzor', null)).toEqual({ uz: 'Texnik nazorat', ru: 'Технадзор' });
    expect(tekshiruvHavolasi('https://x.uz/', 'ABC')).toBe('https://x.uz/t/ABC');
    expect(sanaMatni('2026-12-18T09:30:00.123Z')).toBe('18.12.2026 14:30 (UTC+5)');
  });
});
