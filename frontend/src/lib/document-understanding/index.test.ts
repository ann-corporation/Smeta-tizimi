import { describe, expect, it } from 'vitest';
import { sourceDecimal, understandText, understandWorkbook } from './index';
import type { KirishKitob } from '../smeta-anatomiya/turlar';
import { kitobAnatomiyasi } from '../smeta-anatomiya';

const workbook = (rows: KirishKitob['varaqlar'][number]['rows'], formulalar?: KirishKitob['varaqlar'][number]['formulalar']): KirishKitob => ({ fayl: 'source.xlsx', varaqlar: [{ nom: 'Расчёт', rows, formulalar }] });

describe('lossless document source evidence', () => {
  it('provides the evidence through the canonical parser used by existing system callers', () => {
    const input = workbook([['НДС', '12%', 120]], [[], [null, 'NamedAmount']]);
    const result = kitobAnatomiyasi(input);
    expect(result.sourceEvidence.sheets[0].rates[0].percentages[0].decimal).toBe('12');
    expect(result.sourceEvidence.issues.some((i) => i.code === 'FORMULA_DEPENDENCY_REVIEW')).toBe(true);
    expect(result.sourceEvidence.importAllowed).toBe(false);
  });
  it('retains exact decimal strings, explicit zero and missing values', () => {
    expect(sourceDecimal('1\u202f234\u00a0567,890123456789')).toBe('1234567.890123456789');
    expect(sourceDecimal('(1 234,50)')).toBe('-1234.50');
    expect(sourceDecimal('0')).toBe('0');
    for (const value of [null, undefined, '', true, '12 UZS', '1,234.50', '#REF!', Infinity]) expect(sourceDecimal(value)).toBeNull();
  });

  it('keeps every source cell including unknown rows, original whitespace and formulas without a cache', () => {
    const input = workbook([['  Xom izoh  ', 0, false], [null, null]], [[], [null, 'SUM(B1:B1)']]);
    const before = structuredClone(input);
    const result = understandWorkbook(input);
    expect(input).toEqual(before);
    expect(result.source).toEqual(before);
    expect(result.sheets[0].cells).toHaveLength(4);
    expect(result.sheets[0].cells[0].raw).toBe('  Xom izoh  ');
    expect(result.sheets[0].cells.at(-1)).toMatchObject({ address: 'B2', raw: null, formula: 'SUM(B1:B1)', decimal: null });
    expect(result.issues.some((i) => i.code === 'FORMULA_VALUE_UNKNOWN')).toBe(true);
    expect(result.coverage.sourceRows).toBe(2);
    expect(result.importAllowed).toBe(false);
    result.source.varaqlar[0].rows[0][0] = 'changed snapshot';
    expect(input).toEqual(before);
  });

  it('does not interpret a currency amount as an unmarked percentage', () => {
    const result = understandWorkbook(workbook([['НДС', 12, 120000], ['Транспорт', '5%', '5000.50'], ['Страхование', '0,32 %', 320]]));
    const rates = result.sheets[0].rates;
    expect(rates[0]).toMatchObject({ category: 'vat', percentages: [], status: 'review' });
    expect(rates[0].amountCandidates.map((c) => c.decimal)).toEqual(['12', '120000']);
    expect(rates[1]).toMatchObject({ category: 'transport', percentages: [{ address: 'B2', decimal: '5' }], status: 'explicit' });
    expect(rates[2].percentages[0].decimal).toBe('0.32');
  });

  it('uses a source percentage column header without confusing it with the amount', () => {
    const result = understandWorkbook(workbook([['Наименование', 'Процент', 'Сумма'], ['НДС', '12', '120000'], ['РИСК', 0, 0]]));
    expect(result.sheets[0].rates[0]).toMatchObject({ percentages: [{ address: 'B2', decimal: '12' }], status: 'explicit' });
    expect(result.sheets[0].rates[0].amountCandidates[0].decimal).toBe('120000');
    expect(result.sheets[0].rates[1].percentages[0].decimal).toBe('0');
  });

  it('preserves zero rates and negative correction amounts', () => {
    const result = understandWorkbook(workbook([['РИСК', 0, '%', '-2500,01']]));
    expect(result.sheets[0].rates[0]).toMatchObject({ percentages: [{ address: 'B1', decimal: '0' }], status: 'explicit' });
    expect(result.sheets[0].rates[0].amountCandidates[0].decimal).toBe('-2500.01');
  });

  it('does not silently choose one of conflicting source rates', () => {
    const rate = understandWorkbook(workbook([['НДС 12% или 15%', 120]])).sheets[0].rates[0];
    expect(rate.status).toBe('review');
    expect(rate.percentages.map((r) => r.decimal)).toEqual(['12', '15']);
  });

  it('does not reinterpret a transport work or a material description as a surcharge', () => {
    const input = workbook([
      ['№№', 'ОБОСНОВАНИЕ', 'НАИМЕНОВАНИЕ РАБОТ И РЕСУРСОВ', 'ЕД.ИЗМ', 'КОЛ-ВО', null, 'ЦЕНА', 'СУММА'],
      [null, null, null, null, 'НА ЕДИНИЦУ', 'ПО ПРОЕКТУ', null, null],
      [1, 2, 3, 4, 5, 6, 7, 8],
      ['1', 'E1-1-195-20', 'ТРАНСПОРТИРОВКА ГРУНТА', '1000М3', '1', '1', 20, 20],
      ['1.1', '000001', 'МАТЕРИАЛ С СОДЕРЖАНИЕМ РИСКА 12%', 'М3', '1', '1', 20, 20],
    ]);
    input.varaqlar[0].nom = 'LRV';
    const result = understandWorkbook(input);
    expect(result.anatomy.varaqlar[0].ishlar).toHaveLength(1);
    expect(result.sheets[0].rates).toEqual([]);
    expect(result.sheets[0].cells.some((cell) => cell.raw === 'МАТЕРИАЛ С СОДЕРЖАНИЕМ РИСКА 12%')).toBe(true);
  });

  it('captures all expenditure categories without hardcoded rates', () => {
    const rows = ['Накладные расходы', 'Сметная прибыль', 'Зимнее удорожание', 'Временные здания', 'Заготовительно-складские расходы', 'Непредвиденные затраты'].map((label) => [label, '1,25%']);
    const result = understandWorkbook(workbook(rows));
    expect(result.sheets[0].rates.map((r) => r.category)).toEqual(['overhead', 'profit', 'winter', 'temporary', 'storage', 'risk']);
    expect(result.sheets[0].rates.every((r) => r.percentages[0].decimal === '1.25')).toBe(true);
  });

  it('retains named-sheet references with apostrophes and ignores string literals', () => {
    const input = workbook([[10]], [[`SUM('O''Brien'!$B$2:$B$3)+IF(A2="Z99",0,1)`]]);
    input.varaqlar.push({ nom: "O'Brien", rows: [] });
    const formula = understandWorkbook(input).sheets[0].formulas[0];
    expect(formula.status).toBe('direct_references');
    expect(formula.references).toEqual([{ sheet: "O'Brien", range: 'B2:B3' }, { sheet: 'Расчёт', range: 'A2' }]);
  });

  it.each(['INDIRECT("A1")', 'Table1[Amount]', '[other.xlsx]Sheet1!A1', 'SUM(Missing!A1)', 'NamedAmount*0.12', 'LOG10(A1)'])('requires dependency review for %s', (expression) => {
    const result = understandWorkbook(workbook([[10]], [[expression]]));
    expect(result.sheets[0].formulas[0].status).toBe('review');
    expect(result.issues.some((i) => i.code === 'FORMULA_DEPENDENCY_REVIEW')).toBe(true);
  });

  it('surfaces source spreadsheet errors', () => {
    const result = understandWorkbook(workbook([['#REF!', '#VALUE!', '#DIV/0!', '#N/A']]));
    expect(result.issues.filter((i) => i.code === 'SOURCE_CELL_ERROR')).toHaveLength(4);
  });

  it('keeps merged cells and outlines exactly in the envelope', () => {
    const input = workbook([['РАЗДЕЛ: Административное здание'], ['КЖ'], ['Земляные работы']]);
    input.varaqlar[0].merges = [{ r1: 0, c1: 0, r2: 0, c2: 4 }];
    input.varaqlar[0].outline = [0, 1, 2];
    expect(understandWorkbook(input).source).toEqual(input);
  });

  it('covers data beyond Z and preserves formula-only rows outside cached data', () => {
    const input = workbook([Array.from({ length: 28 }, (_, i) => i)], [[], [], ['A1+AA1']]);
    const result = understandWorkbook(input);
    expect(result.sheets[0].cells.some((c) => c.address === 'AB1' && c.raw === 27)).toBe(true);
    expect(result.sheets[0].formulas[0].source.address).toBe('A3');
    expect(result.coverage.sourceCells).toBe(29);
  });

  it('flags duplicated sheet identity', () => {
    const input = workbook([['note']]); input.varaqlar.push({ nom: 'Расчёт', rows: [[1]] });
    expect(understandWorkbook(input).issues.some((i) => i.code === 'DUPLICATE_SHEET_NAME')).toBe(true);
  });

  it('does not turn OCR or untyped documents into certified facts', () => {
    const source = [{ page: 7, text: '  Акт\r\n12,50\n\nПодпись', origin: 'ocr' as const }];
    const result = understandText('scan.pdf', source);
    expect(result.pages[0].text).toBe(source[0].text);
    expect(result.pages[0].lines).toEqual([{ line: 1, raw: '  Акт' }, { line: 2, raw: '12,50' }, { line: 3, raw: '' }, { line: 4, raw: 'Подпись' }]);
    expect(result.pages[0].review).toBe('OCR_NOT_VERIFIED');
    expect(result.importAllowed).toBe(false);
  });
});
