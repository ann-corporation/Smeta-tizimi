import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { prixodKitobOqi, prixodMiqdor, prixodSana } from './kitob';

const options = { faylNomi: 'synthetic.xlsx', kompaniyaId: 2, skladId: 7 };
const header = ['№', 'тип материала', 'Дата', 'Наименование', 'Ед.изм', 'Приход', 'С/Ф подтвержденный', 'Поставщик'];
const row = (nom = 'Цемент', quantity: unknown = 5): unknown[] => [1, 'Материал', '03.01.2025', nom, 'т', quantity, null, 'СИНТЕТИКА'];
function fixture(rows: unknown[][], change?: (s: XLSX.WorkSheet, w: XLSX.WorkBook) => void, sheetName = 'Приход'): Uint8Array {
  const w = XLSX.utils.book_new(); const s = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(w, s, sheetName);
  XLSX.utils.book_append_sheet(w, XLSX.utils.aoa_to_sheet([header, row('UNVERIFIED', 999)]), 'Расход');
  XLSX.utils.book_append_sheet(w, XLSX.utils.aoa_to_sheet([header, row('COPY', 888)]), 'Приход (копия)');
  change?.(s, w);
  return new Uint8Array(XLSX.write(w, { type: 'array', bookType: 'xlsx' }));
}

describe('C11 receipt-only source preview', () => {
  it('only exact Приход is parsed; prices stay unknown, bytes and source row stay intact', async () => {
    const bytes = fixture([[], [], header, row()]); const before = bytes.slice();
    const result = await prixodKitobOqi(bytes, options);
    expect(result.qatorlar).toHaveLength(1);
    expect(result.qatorlar[0]).toMatchObject({ manbaQator: 4, sana: '2025-01-03', nom: 'Цемент', miqdor: 5, narx: null, summa: null, qqs: null, holat: 'yangi' });
    expect(result.otkazilganVaraqlar).toEqual(['Расход', 'Приход (копия)']);
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.takrorTekshirildi).toBe(false);
    expect(bytes).toEqual(before);
  });
  it('overwritten source D header is an explicit warning, not a lost material column', async () => {
    const result = await prixodKitobOqi(fixture([[...header.slice(0,3), 'Source material', ...header.slice(4)], row()]), options);
    expect(result.ogohlar).toContain('NOM_SARLAVHASI');
    expect(result.qatorlar[0].nom).toBe('Цемент');
  });
  it('prefilled supplier/type templates are excluded, but incomplete entered rows are retained', async () => {
    const bad = row(); bad[4] = null; bad[5] = null;
    const result = await prixodKitobOqi(fixture([header, row(), [null,'Материал',null,null,null,null,null,'Supplier'], bad]), options);
    expect(result.boshQatorlar).toBe(1); expect(result.qatorlar).toHaveLength(2);
    expect(result.qatorlar[1]).toMatchObject({ manbaQator: 4, miqdor: null, holat: 'xato' });
    expect(result.qatorlar[1].xatolar).toEqual(['BIRLIK_YOQ', 'MIQDOR_YOQ']);
  });
  it('date formatted quantity is never silently used as an Excel serial quantity', async () => {
    const result = await prixodKitobOqi(fixture([header, row('Цемент', 46152)], s => { s.F2.z = 'dd.mm.yyyy'; }), options);
    expect(result.qatorlar[0]).toMatchObject({ miqdor: null, holat: 'xato', xatolar: ['MIQDOR_SANA'] });
  });
  it('known zero quantity is preserved and flagged rather than silently omitted or made positive', async () => {
    const result = await prixodKitobOqi(fixture([header, row('Zero', 0), row('Negative', -2)]), options);
    expect(result.qatorlar.map(q => [q.miqdor, q.holat])).toEqual([[0,'xato'],[-2,'xato']]);
  });
  it('same source values in two physical rows remain two entries; repeat keys are scoped to company/warehouse', async () => {
    const bytes = fixture([header, row(), row()]);
    const first = await prixodKitobOqi(bytes, options);
    const keys = first.qatorlar.map(q => q.kalit!);
    expect(new Set(keys).size).toBe(2);
    const repeated = await prixodKitobOqi(bytes, {...options,oldingiKalitlar:keys});
    expect(repeated.jami.takror).toBe(2); expect(repeated.takrorTekshirildi).toBe(true);
    expect((await prixodKitobOqi(bytes, {...options,skladId:8,oldingiKalitlar:keys})).jami.yangi).toBe(2);
    expect((await prixodKitobOqi(bytes, {...options,kompaniyaId:3,oldingiKalitlar:keys})).jami.yangi).toBe(2);
  });
  it('normalization candidates never rename or merge Cyrillic/Latin/typo source rows', async () => {
    const result = await prixodKitobOqi(fixture([header,row('Автомат'),row('Avtomat'),row('Афтомат')]),options);
    expect(result.qatorlar.map(q=>q.nom)).toEqual(['Автомат','Avtomat','Афтомат']);
    expect(result.nomTakliflari).toHaveLength(1); expect(result.nomTakliflari[0].nomlar).toHaveLength(3);
    expect(result.jami.yangi).toBe(3);
  });
  it('formula quantities keep cached evidence and require attention, not local formula evaluation', async () => {
    const result = await prixodKitobOqi(fixture([header,row()],s=>{s.F2.f='2+3';}), options);
    expect(result.qatorlar[0].miqdor).toBe(5); expect(result.qatorlar[0].ogohlar).toContain('MIQDOR_FORMULA');
  });
  it('workbook date1904 is respected', async () => {
    const result = await prixodKitobOqi(fixture([header,row()],(s,w)=>{s.C2={t:'n',v:1,z:'dd.mm.yyyy'};w.Workbook={WBProps:{date1904:true}};}),options);
    expect(result.qatorlar[0].sana).toBe('1904-01-02');
  });
  it('missing exact receipt sheet is rejected; a copy cannot substitute for the original', async () => {
    await expect(prixodKitobOqi(fixture([header,row()],undefined,'Other'),options)).rejects.toThrow('PRIXOD_SHEET_REQUIRED');
  });
  it('unselected warehouse does not generate an actionable dedup key', async () => {
    const result = await prixodKitobOqi(fixture([header,row()]),{...options,skladId:null});
    expect(result.qatorlar[0].kalit).toBeNull();
  });
});

it('quantity parser rejects ambiguous formats, keeps decimal precision and missing/zero distinct', () => {
  expect(prixodMiqdor('1 234,50')).toBe(1234.5);
  expect(prixodMiqdor('1,234.50')).toBeNull();
  expect(prixodMiqdor('10 кг')).toBeNull();
  expect(prixodMiqdor('')).toBeNull(); expect(prixodMiqdor('0')).toBe(0);
  expect(prixodMiqdor('0.000123')).toBe(0.000123);
});
it('explicit invalid dates remain unknown rather than becoming today', () => {
  expect(prixodSana('29.02.2024')).toBe('2024-02-29'); expect(prixodSana('29.02.2025')).toBeNull();
  expect(prixodSana('01.06.0026')).toBeNull(); expect(prixodSana('')).toBeNull();
});
