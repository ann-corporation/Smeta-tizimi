import { describe, expect, it } from 'vitest';
// eslint-disable-next-line no-restricted-imports -- test fixture workbook builder only
import * as XLSX from 'xlsx';
import { readXlsx } from '../../src/lib/f2-import-parse/xlsxReader';
import {
  avtoUstunlar,
  tanlanganLrvVaraqlaridanDaraxtQur,
  varaqTuriTaxmin,
} from '../../src/admin/sahifalar/SmetaYuklaNative';

const lrvRows = [
  ['№', 'ШИФР', 'НАИМЕНОВАНИЕ РАБОТ И РЕСУРСОВ', 'ЕД. ИЗМ.', 'КОЛИЧЕСТВО', 'ЦЕНА', 'СУММА'],
  ['РАЗДЕЛ: Земляные работы'],
  [1, 'A-1', 'Разработка грунта', 'м3', 2, 10, 20],
];

const transportRows = [
  ['№', 'ШИФР', 'НАИМЕНОВАНИЕ', 'ЕД. ИЗМ.', 'КОЛИЧЕСТВО', 'Расстояние, км', 'Грузооборот, т·км', 'ЦЕНА', 'СУММА'],
  [1, 'TR-1', 'Перевозка грунта', 'т', 10, 4, 40, 100, 1000],
  [2, 'TR-2', 'Перевозка щебня', 'т', 5, 7, 35, 120, 600],
];

async function parseWorkbook(sheets: Array<[string, unknown[][]]>) {
  const book = XLSX.utils.book_new();
  for (const [name, rows] of sheets) {
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), name);
  }
  const bytes = XLSX.write(book, { type: 'array', bookType: 'xlsx', compression: true }) as ArrayBuffer;
  return readXlsx(bytes);
}

describe('C2 synthetic transport worksheet import through XLSX reader', () => {
  it('ignores a non-LRV transport sheet when the workbook also contains an LRV sheet', async () => {
    const book = await parseWorkbook([
      ['Смета', lrvRows],
      ['Лист2', transportRows],
    ]);
    const lrv = book.sheet('Смета')!;
    const transport = book.sheet('Лист2')!;

    expect(book.sheets).toHaveLength(2);
    expect(transport.rows).toEqual(transportRows);
    expect(varaqTuriTaxmin(lrv.rows, lrv.name)).toBe('lrv');
    expect(varaqTuriTaxmin(transport.rows, transport.name)).toBe('nomalum');

    // Mirrors native upload's initial auto-tagging: nomalum => ignored; only
    // sheets tagged LRV feed the actual selected-LRV tree builder.
    const selected = book.sheets.flatMap((sheet) => {
      if (varaqTuriTaxmin(sheet.rows, sheet.name) !== 'lrv') return [];
      return [{ name: sheet.name, rows: sheet.rows, cols: avtoUstunlar(sheet.rows, sheet.name) }];
    });
    const tree = tanlanganLrvVaraqlaridanDaraxtQur(selected);
    const serialized = JSON.stringify(tree);
    expect(selected.map((sheet) => sheet.name)).toEqual(['Смета']);
    expect(tree.length).toBeGreaterThan(0);
    expect(serialized).toContain('Разработка грунта');
    expect(serialized).not.toContain('Перевозка грунта');
    expect(serialized).not.toContain('Перевозка щебня');
  });

  it('transport-only workbook hits first-sheet LRV fallback and loses transport-only columns in a synthetic root RZ', async () => {
    const book = await parseWorkbook([['Лист1', transportRows]]);
    const sheet = book.sheet('Лист1')!;
    expect(book.sheets).toHaveLength(1);
    expect(sheet.rows).toEqual(transportRows);
    expect(varaqTuriTaxmin(sheet.rows, sheet.name)).toBe('nomalum');

    // Exact native upload fallback at SmetaYuklaNative.tsx:1164-1167:
    // when nothing is detected as LRV, the first sheet is force-tagged LRV.
    const fallbackTree = tanlanganLrvVaraqlaridanDaraxtQur([{
      name: sheet.name,
      rows: sheet.rows,
      cols: avtoUstunlar(sheet.rows, sheet.name),
    }]);
    expect(fallbackTree).toHaveLength(1);
    expect(fallbackTree[0]).toMatchObject({ type: 'rz', nom: 'Асосий бўлим' });
    expect(fallbackTree[0].children).toHaveLength(2);
    expect(fallbackTree[0].children?.map((row) => ({ type: row.type, nom: row.nom, bir: row.bir, hajm: row.hajm, summa: row.summa })))
      .toEqual([
        { type: 'rs', nom: 'Перевозка грунта', bir: 'т', hajm: 10, summa: 1000 },
        { type: 'rs', nom: 'Перевозка щебня', bir: 'т', hajm: 5, summa: 600 },
      ]);
    // AktNode has no distance/tonne-km field; the native tree conversion
    // therefore retains row qty/price/sum but drops 4/40 and 7/35.
    expect(JSON.stringify(fallbackTree)).not.toContain('Грузооборот');
    expect(JSON.stringify(fallbackTree)).not.toContain('Расстояние');
  });
});
