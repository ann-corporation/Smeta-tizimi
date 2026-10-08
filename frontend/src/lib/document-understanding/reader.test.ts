// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildZip } from '../f2-import-parse/testFixtures';
import { readDocumentWorkbook } from './reader';
import * as XLSX from 'xlsx';

function fixture(sheetXml: string): Uint8Array {
  return buildZip({
    'xl/workbook.xml': '<workbook><sheets><sheet name="Расчёт" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': sheetXml,
  });
}

describe('binary document to source evidence', () => {
  it('keeps both row and column origin in a legacy XLS whose first used cell is C3', async () => {
    const ws: XLSX.WorkSheet = { C3: { t: 's', v: 'Original title' }, D4: { t: 'n', v: 0 }, '!ref': 'C3:D4' };
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Legacy');
    const bytes = XLSX.write(wb, { type: 'array', bookType: 'biff8' });
    const result = await readDocumentWorkbook('legacy.xls', bytes);
    expect(result.sheets[0].cells.find((c) => c.raw === 'Original title')?.address).toBe('C3');
    expect(result.sheets[0].cells.find((c) => c.raw === 0)?.address).toBe('D4');
  });
  it('retains high precision lexical numbers, formula, row identity, merges and outline from real OOXML bytes', async () => {
    const bytes = fixture('<worksheet><sheetData><row r="3" outlineLevel="2"><c r="A3" t="inlineStr"><is><t>НДС</t></is></c><c r="B3"><v>123456789012345.6789</v></c><c r="C3"><f>B3*0.12</f><v>14814814681481.481468</v></c></row></sheetData><mergeCells><mergeCell ref="A1:B1"/></mergeCells></worksheet>');
    const original = bytes.slice();
    const result = await readDocumentWorkbook('real-container.xlsx', bytes);
    expect(bytes).toEqual(original);
    const sheet = result.sheets[0];
    expect(sheet.cells.find((c) => c.address === 'B3')?.decimal).toBe('123456789012345.6789');
    expect(sheet.formulas[0].source).toMatchObject({ address: 'C3', formula: 'B3*0.12', decimal: '14814814681481.481468' });
    expect(result.source.varaqlar[0].outline?.[2]).toBe(2);
    expect(result.source.varaqlar[0].merges).toEqual([{ r1: 0, c1: 0, r2: 0, c2: 1 }]);
    expect(sheet.rates[0].status).toBe('review');
  });

  it('flags shared formulas whose expression is unavailable instead of claiming complete dependencies', async () => {
    const result = await readDocumentWorkbook('shared.xlsx', fixture('<worksheet><sheetData><row r="1"><c r="A1"><f t="shared" si="0"/><v>1</v></c></row></sheetData></worksheet>'));
    expect(result.sheets[0].formulas[0].status).toBe('review');
    expect(result.issues.some((i) => i.code === 'FORMULA_DEPENDENCY_REVIEW')).toBe(true);
  });

  it('keeps missing cached formula values unknown', async () => {
    const result = await readDocumentWorkbook('missing-cache.xlsx', fixture('<worksheet><sheetData><row r="9"><c r="F9"><f>SUM(A1:A8)</f></c></row></sheetData></worksheet>'));
    expect(result.sheets[0].formulas[0].source).toMatchObject({ address: 'F9', decimal: null });
    expect(result.issues.some((i) => i.code === 'FORMULA_VALUE_UNKNOWN')).toBe(true);
  });
});
