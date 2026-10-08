import { describe, expect, it } from 'vitest';
import { understandWorkbook } from './index';
import { triageUnassignedRows } from './triage';

describe('unassigned source triage', () => {
  it('keeps every unknown row and never promotes a candidate to an approved fact', () => {
    const document = understandWorkbook({ fayl: 'unknown.xlsx', varaqlar: [{ nom: 'Free', rows: [
      ['Произвольный текст'], ['Неизвестная сумма', '-123,456789'], ['Примечание: источник'], ['Проверил: Иванов'],
    ] }] });
    const rows = triageUnassignedRows(document);
    expect(rows.length).toBe(document.coverage.unassignedRows);
    expect(rows.every((row) => row.reviewRequired)).toBe(true);
    expect(rows.find((row) => row.row === 2)?.candidate).toBe('unknown_numeric');
    expect(rows.find((row) => row.row === 2)?.cells[1].decimal).toBe('-123.456789');
    expect(rows.find((row) => row.row === 3)?.candidate).toBe('note');
    expect(rows.find((row) => row.row === 4)?.candidate).toBe('signature');
  });

  it('does not discard unknown formula-only cells or invent a cached value', () => {
    const document = understandWorkbook({ fayl: 'x', varaqlar: [{ nom: 'Free', rows: [[]], formulalar: [['UnknownName']] }] });
    const rows = triageUnassignedRows(document);
    expect(rows[0]).toMatchObject({ candidate: 'unknown_numeric', reviewRequired: true });
    expect(rows[0].cells[0]).toMatchObject({ address: 'A1', raw: null, decimal: null, formula: 'UnknownName' });
  });

  it('keeps coordinates and original whitespace in the candidate packet', () => {
    const document = understandWorkbook({ fayl: 'x', varaqlar: [{ nom: 'Free', rows: [[], [null, '  Особая строка  ', false]] }] });
    const rows = triageUnassignedRows(document);
    expect(rows[0]).toMatchObject({ sheet: 'Free', row: 2, candidate: 'unknown_text' });
    expect(rows[0].cells.map((cell) => [cell.address, cell.raw])).toEqual([['B2', '  Особая строка  '], ['C2', false]]);
  });

  it('recognizes explicit labour totals as source summaries, not resource norms or wages', () => {
    const document = understandWorkbook({ fayl: 'x', varaqlar: [{ nom: 'Free', rows: [
      ['ISHCHILARNING MEHNAT XARAJATLARI', 'ЧЕЛ-ЧАС', '533,3131'], ['ЗАРАБОТНАЯ ПЛАТА', 0, 'сум'],
    ] }] });
    const rows = triageUnassignedRows(document);
    expect(rows[0]).toMatchObject({ candidate: 'summary', reviewRequired: true, summary: { metric: 'labour_quantity', values: [{ decimal: '533.3131' }], units: [{ raw: 'ЧЕЛ-ЧАС' }] } });
    expect(rows[1].summary?.values[0].decimal).toBe('0');
    expect(rows[1].summary?.metric).toBe('labour_cost');
  });

  it('recognizes Uzbek source headers and basis labels without fuzzy translation', () => {
    const document = understandWorkbook({ fayl: 'x', varaqlar: [{ nom: 'Free', rows: [
      ['№№', 'ASOS', 'ISH VA RESURSLAR NOMI', "O'LCHOV BIRLIGI", 'MIQDOR', 'NARX', 'SUMMA'],
      ['ASOS:  '], ['QURILISH NOMI: example'], ['ИНЕРТНЫЕ МАТЕРИАЛЫ'],
    ] }] });
    const rows = triageUnassignedRows(document);
    expect(rows.find((row) => row.row === 1)?.candidate).toBe('table_header');
    expect(rows.find((row) => row.row === 2)?.candidate).toBe('note');
    expect(rows.find((row) => row.row === 2)?.cells[0].raw).toBe('ASOS:  ');
    expect(rows.find((row) => row.row === 4)?.candidate).toBe('resource_group');
  });
});
