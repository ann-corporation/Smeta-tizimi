import { expect, it } from 'vitest';
import { understandWorkbook } from './index';
import { analyzeRateDependencies } from './rate-dependencies';

it('links explicit formula source cells without inferring a base from neighbouring totals', () => {
  const book = understandWorkbook({ fayl: 'rates.xlsx', varaqlar: [{ nom: 'S', rows: [['ИТОГО', 100], ['НДС 12%', 12]], formulalar: [[], [null, 'B1*12/100']] }] });
  const result = analyzeRateDependencies(book);
  expect(result[0].sources[0].dependencies[0]).toMatchObject({ sheet: 'S', range: 'B1', exactCell: { decimal: '100' } });
  expect(result[0].calculationBaseApproved).toBe(false);
});

it('keeps literal zero and missing formulas separate from a proven calculation base', () => {
  const book = understandWorkbook({ fayl: 'rates.xlsx', varaqlar: [{ nom: 'S', rows: [['НДС 0%', 0]] }] });
  const result = analyzeRateDependencies(book);
  expect(result[0]).toMatchObject({ status: 'BASE_NOT_PROVEN', percentages: [{ decimal: '0' }], sources: [] });
});
