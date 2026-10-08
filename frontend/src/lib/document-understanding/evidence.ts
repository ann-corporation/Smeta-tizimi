import type { KitobAnatomiyasi } from '../smeta-anatomiya';
import type { Katak, KirishKitob, KirishVaraq } from '../smeta-anatomiya/turlar';
import { analyzeTextEvidence } from './text-evidence';

/** Source evidence, never a command to mutate certified business data. */
export interface CellEvidence {
  sheet: string;
  address: string;
  raw: Katak;
  decimal: string | null;
  formula: string | null;
}
export interface UnderstandingIssue {
  code: string;
  sheet: string;
  address: string | null;
  detail: string;
}
export interface RateEvidence {
  sheet: string;
  row: number;
  label: string;
  category: 'vat' | 'transport' | 'storage' | 'overhead' | 'profit' | 'insurance' | 'risk' | 'winter' | 'temporary' | 'other';
  /** Only explicitly marked percentages; no default rates. */
  percentages: Array<{ address: string; decimal: string }>;
  amountCandidates: CellEvidence[];
  formulaCells: CellEvidence[];
  status: 'explicit' | 'review';
}
export interface FormulaEvidence {
  source: CellEvidence;
  /** Source references only. The formula is not evaluated. */
  references: Array<{ sheet: string; range: string }>;
  status: 'direct_references' | 'review';
}
export interface SheetUnderstanding {
  name: string;
  cells: CellEvidence[];
  formulas: FormulaEvidence[];
  rates: RateEvidence[];
  /** Rows not represented by the existing semantic reader are never discarded. */
  unassignedRows: number[];
  metadata: { formulas: 'provided' | 'unavailable'; numericLexical: 'provided' | 'unavailable' };
}
export interface WorkbookEvidence {
  version: 'source-evidence-v1';
  file: string;
  sheets: SheetUnderstanding[];
  issues: UnderstandingIssue[];
  importAllowed: false;
  coverage: { sourceCells: number; sourceRows: number; representedRows: number; unassignedRows: number };
}

/** Exact lexical decimal normalization; no binary arithmetic or rounding. */
export function sourceDecimal(raw: Katak): string | null {
  if (raw == null || typeof raw === 'boolean') return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? String(raw) : null;
  let value = raw.trim().replace(/[ \u00a0\u202f]/g, '');
  if (/^\([\d.,]+\)$/.test(value)) value = `-${value.slice(1, -1)}`;
  if (/^[+-]?\d+(,\d+)?$/.test(value)) value = value.replace(',', '.');
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value) ? value : null;
}

function columnName(index: number): string {
  let n = index + 1;
  let name = '';
  while (n > 0) { n--; name = String.fromCharCode(65 + n % 26) + name; n = Math.floor(n / 26); }
  return name;
}
function category(label: string): RateEvidence['category'] | null {
  const rules: Array<[RegExp, RateEvidence['category']]> = [
    [/НДС|QQS|VAT/i, 'vat'], [/ТРАНСПОРТ|TRANSPORT/i, 'transport'],
    [/СКЛАД|ЗАГОТОВ|OMBOR/i, 'storage'], [/НАКЛАД|ПРОЧИЕ.*ПОДРЯД|USTAMA/i, 'overhead'],
    [/ПРИБЫЛ|FOYDA/i, 'profit'], [/СТРАХ|SUG.?URTA/i, 'insurance'],
    [/РИСК|RISK|НЕПРЕДВИД/i, 'risk'], [/ЗИМН|QISH/i, 'winter'],
    [/ВРЕМЕНН.*ЗДАН|VAQTINCHA/i, 'temporary'],
  ];
  return rules.find(([pattern]) => pattern.test(label))?.[1] ?? (/%|ПРОЦЕНТ|FOIZ/i.test(label) ? 'other' : null);
}

function readFormula(cell: CellEvidence, sheetNames: Set<string>): FormulaEvidence {
  const formula = cell.formula ?? '';
  // Remove Excel string literals: a literal "A1" is not a cell reference.
  const expression = formula.replace(/"(?:[^"]|"")*"/g, '""');
  const references: FormulaEvidence['references'] = [];
  const consumed: Array<{ start: number; length: number }> = [];
  const pattern = /(?:(?:'((?:[^']|'')+)'|([\p{L}_][\p{L}\d_. ]*))!)?(\$?[A-Z]{1,3}\$?\d+)(?::(\$?[A-Z]{1,3}\$?\d+))?/gu;
  for (const match of expression.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > 0 && /[\p{L}\d_.]/u.test(expression[start - 1])) continue;
    if (/^\s*\(/.test(expression.slice(start + match[0].length))) continue;
    const sheet = match[1]?.replace(/''/g, "'") ?? match[2] ?? cell.sheet;
    references.push({ sheet, range: `${match[3]}${match[4] ? `:${match[4]}` : ''}`.replaceAll('$', '') });
    consumed.push({ start, length: match[0].length });
  }
  // Dynamic/named/structured/external references require the workbook evaluator.
  let remaining = expression;
  for (const span of consumed.reverse()) remaining = remaining.slice(0, span.start) + remaining.slice(span.start + span.length);
  const residual = remaining.replace(/\b(?:SUM|ROUND|IF|MIN|MAX|ABS|COUNT|AVERAGE)\s*(?=\()/gi, '');
  const unresolved = /[\p{L}_[\]#]/u.test(residual) || references.some((r) => !sheetNames.has(r.sheet));
  return { source: cell, references, status: unresolved ? 'review' : 'direct_references' };
}

function readSheet(input: KirishVaraq, represented: Set<number>, resourceRows: Set<number>, names: Set<string>, issues: UnderstandingIssue[]): SheetUnderstanding {
  const cells: CellEvidence[] = [];
  const formulas: FormulaEvidence[] = [];
  const rates: RateEvidence[] = [];
  const unassignedRows: number[] = [];
  const percentageColumns = new Set<number>();
  const metadata: SheetUnderstanding['metadata'] = {
    formulas: input.formulalar ? 'provided' : 'unavailable',
    numericLexical: input.numericText ? 'provided' : 'unavailable',
  };
  if (metadata.formulas === 'unavailable') issues.push({ code: 'FORMULA_METADATA_UNAVAILABLE', sheet: input.nom, address: null, detail: 'Caller did not supply source formulas; absence of formulas is not proven' });
  const rows = Math.max(input.rows.length, input.formulalar?.length ?? 0);
  for (let r = 0; r < rows; r++) {
    const row = input.rows[r] ?? [];
    const formulaRow = input.formulalar?.[r] ?? [];
    const rowCells: CellEvidence[] = [];
    for (let c = 0; c < Math.max(row.length, formulaRow.length); c++) {
      const raw = row[c] ?? null;
      const formula = formulaRow[c] || null;
      if ((raw == null || raw === '') && !formula) continue;
      const cell: CellEvidence = { sheet: input.nom, address: `${columnName(c)}${r + 1}`, raw, decimal: sourceDecimal(input.numericText?.[r]?.[c] ?? raw), formula };
      rowCells.push(cell); cells.push(cell);
      if (typeof raw === 'string' && /^#(?:REF!|VALUE!|DIV\/0!|N\/A|NAME\?|NUM!|NULL!|SPILL!|CALC!)/.test(raw)) {
        issues.push({ code: 'SOURCE_CELL_ERROR', sheet: input.nom, address: cell.address, detail: raw });
      }
      if (formula) {
        const parsed = readFormula(cell, names);
        formulas.push(parsed);
        if (cell.decimal == null) issues.push({ code: 'FORMULA_VALUE_UNKNOWN', sheet: input.nom, address: cell.address, detail: formula });
        if (parsed.status === 'review') issues.push({ code: 'FORMULA_DEPENDENCY_REVIEW', sheet: input.nom, address: cell.address, detail: formula });
      }
    }
    if (!rowCells.length) continue;
    if (!represented.has(r + 1)) unassignedRows.push(r + 1);
    const label = rowCells.filter((c) => typeof c.raw === 'string' && c.decimal == null).map((c) => String(c.raw)).join(' | ');
    const kind = category(label);
    // Explicit column headers only. A bare numeric rate is never guessed.
    let percentageHeader = false;
    if (rowCells.every((cell) => cell.decimal == null && cell.formula == null)) {
      for (let c = 0; c < row.length; c++) {
        if (typeof row[c] === 'string' && /^(?:%|ПРОЦЕНТ(?:Ы)?|FOIZ|СТАВКА\s*,?\s*%)$/i.test(String(row[c]).trim())) { percentageColumns.add(c); percentageHeader = true; }
      }
    }
    if (!kind || percentageHeader || resourceRows.has(r + 1)) continue;
    const percentages: RateEvidence['percentages'] = [];
    for (const cell of rowCells) {
      if (typeof cell.raw !== 'string') continue;
      for (const match of cell.raw.matchAll(/([+-]?\d+(?:[.,]\d+)?)\s*%/g)) {
        percentages.push({ address: cell.address, decimal: sourceDecimal(match[1])! });
      }
    }
    // A separate '%' cell immediately following a numeric cell is explicit.
    for (let c = 1; c < row.length; c++) {
      if (typeof row[c] !== 'string' || String(row[c]).trim() !== '%') continue;
      const decimal = sourceDecimal(input.numericText?.[r]?.[c - 1] ?? row[c - 1]);
      if (decimal != null) percentages.push({ address: `${columnName(c - 1)}${r + 1}`, decimal });
    }
    for (const c of percentageColumns) {
      const decimal = sourceDecimal(input.numericText?.[r]?.[c] ?? row[c]);
      const address = `${columnName(c)}${r + 1}`;
      if (decimal != null && !percentages.some((p) => p.address === address)) percentages.push({ address, decimal });
    }
    const uniqueRates = new Set(percentages.map((p) => p.decimal));
    const fact: RateEvidence = {
      sheet: input.nom, row: r + 1, label, category: kind, percentages,
      amountCandidates: rowCells.filter((c) => c.decimal != null && !percentages.some((p) => p.address === c.address)),
      formulaCells: rowCells.filter((c) => c.formula != null),
      status: uniqueRates.size === 1 ? 'explicit' : 'review',
    };
    rates.push(fact);
    if (fact.status === 'review') issues.push({ code: 'RATE_UNKNOWN_OR_AMBIGUOUS', sheet: input.nom, address: rowCells[0].address, detail: label });
  }
  if (unassignedRows.length) issues.push({ code: 'UNASSIGNED_SOURCE_ROWS', sheet: input.nom, address: null, detail: `${unassignedRows.length}` });
  return { name: input.nom, cells, formulas, rates, unassignedRows, metadata };
}

/** Lossless source envelope plus the single existing semantic engine. No DB writes. */
export function analyzeWorkbookEvidence(source: KirishKitob, anatomy: Pick<KitobAnatomiyasi, 'varaqlar' | 'review'>): WorkbookEvidence {
  const issues: UnderstandingIssue[] = [];
  const names = new Set(source.varaqlar.map((s) => s.nom));
  if (names.size !== source.varaqlar.length) issues.push({ code: 'DUPLICATE_SHEET_NAME', sheet: '', address: null, detail: 'Sheet identity is ambiguous' });
  const sheets = source.varaqlar.map((sheet, index) => {
    const a = anatomy.varaqlar[index];
    const represented = new Set<number>();
    const resourceRows = new Set<number>();
    for (const node of [...a.titul, ...a.sarlavhalar, ...a.jamilar, ...a.vedomost, ...(a.mustaqilResurslar ?? [])]) represented.add(node.manzil.qator);
    for (const resource of [...a.vedomost, ...(a.mustaqilResurslar ?? [])]) resourceRows.add(resource.manzil.qator);
    for (const work of a.ishlar) {
      represented.add(work.manzil.qator); resourceRows.add(work.manzil.qator);
      for (const resource of work.resurslar) { represented.add(resource.manzil.qator); resourceRows.add(resource.manzil.qator); }
    }
    for (const band of a.review) issues.push({ code: band.kod, sheet: sheet.nom, address: band.manzil ? `${columnName((band.manzil.ustun ?? 1) - 1)}${band.manzil.qator}` : null, detail: band.izoh });
    return readSheet(sheet, represented, resourceRows, names, issues);
  });
  for (const band of anatomy.review) issues.push({ code: band.kod, sheet: band.manzil?.varaq ?? '', address: null, detail: band.izoh });
  const sourceRows = sheets.reduce((n, s) => n + new Set(s.cells.map((c) => c.address.replace(/^[A-Z]+/, ''))).size, 0);
  const unassignedRows = sheets.reduce((n, s) => n + s.unassignedRows.length, 0);
  return { version: 'source-evidence-v1', file: source.fayl, sheets, issues, importAllowed: false,
    coverage: { sourceCells: sheets.reduce((n, s) => n + s.cells.length, 0), sourceRows, representedRows: sourceRows - unassignedRows, unassignedRows } };
}

/** PDF/OCR/DOCX text adapters retain page/line identity; OCR is always review. */
export function understandText(file: string, pages: readonly { page: number; text: string; origin: 'native' | 'ocr' }[]) {
  return {
    version: 'source-text-v1' as const, file, importAllowed: false as const,
    pages: pages.map((page) => ({ ...page, lines: page.text.split(/\r\n|\n|\r/).map((raw, i) => ({ line: i + 1, raw })),
      review: page.origin === 'ocr' ? 'OCR_NOT_VERIFIED' : 'SEMANTIC_MAPPING_REQUIRED' })),
    semantic: analyzeTextEvidence(pages),
  };
}
