import type { FormulaEvidence, WorkbookEvidence } from './evidence';

/** Formula dependency evidence, not a percentage base inferred from row order. */
export function analyzeRateDependencies(book: Pick<WorkbookEvidence, 'sheets'>) {
  const rates = book.sheets.flatMap((sheet) => sheet.rates);
  return rates.map((rate) => {
    const sheet = book.sheets.find((item) => item.name === rate.sheet)!;
    const sources = rate.formulaCells.map((cell) => {
      const formula = sheet.formulas.find((item) => item.source.address === cell.address);
      const dependencies = (formula?.references ?? []).map((reference) => {
        const target = book.sheets.find((item) => item.name === reference.sheet);
        const exactCell = !reference.range.includes(':') ? target?.cells.find((item) => item.address === reference.range) ?? null : null;
        const referencedRate = exactCell ? rates.find((item) => item.sheet === reference.sheet && item.formulaCells.some((entry) => entry.address === reference.range)) : undefined;
        return { ...reference, exactCell, referencedRateRow: referencedRate?.row ?? null,
          status: !target ? 'missing_sheet' : reference.range.includes(':') ? 'range_requires_review' : !exactCell ? 'missing_cell' : 'source_cell_found' };
      });
      return { source: cell, formulaStatus: formula?.status ?? 'review' as FormulaEvidence['status'], dependencies };
    });
    return { sheet: rate.sheet, row: rate.row, label: rate.label, percentages: rate.percentages, sources,
      status: sources.length ? 'formula_evidence' : 'BASE_NOT_PROVEN',
      calculationBaseApproved: false as const, canonicalWriteAllowed: false as const };
  });
}
