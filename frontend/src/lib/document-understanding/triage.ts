import type { CellEvidence, WorkbookEvidence } from './evidence';

export type RowCandidateKind = 'table_header' | 'column_numbers' | 'title' | 'signature' | 'note' | 'financial' | 'summary' | 'resource_group' | 'unknown_numeric' | 'unknown_text';
export interface SourceRowCandidate {
  sheet: string;
  row: number;
  cells: CellEvidence[];
  candidate: RowCandidateKind;
  rule: string;
  summary?: { metric: 'labour_quantity' | 'labour_cost' | 'machine_cost' | 'material_cost' | 'transport_cost' | 'equipment_cost'; values: CellEvidence[]; units: CellEvidence[] };
  /** Triage never supplies a business meaning or clears the review gate. */
  reviewRequired: true;
}

function candidate(cells: readonly CellEvidence[]): Pick<SourceRowCandidate, 'candidate' | 'rule'> {
  const labels = cells.filter((cell) => typeof cell.raw === 'string' && cell.decimal == null).map((cell) => String(cell.raw).trim());
  const text = labels.join(' | ');
  if (summary(cells)) return { candidate: 'summary', rule: 'explicit_summary_metric_label' };
  if (labels.some((label) => /^(?:ТРУДОВЫЕ РЕСУРСЫ|СТРОИТЕЛЬНЫЕ МАШИНЫ И МЕХАНИЗМЫ|СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ И КОНСТРУКЦИИ|МЕСТНЫЕ МАТЕРИАЛЫ(?: И КОНСТРУКЦИИ)?|ИНЕРТНЫЕ МАТЕРИАЛЫ|МЕТАЛЛОКОНСТРУКЦИИ|КАБЕЛЬНАЯ ПРОДУКЦИЯ|ОБОРУДОВАНИЕ|ВЕДОМОСТЬ РЕСУРСОВ)$/i.test(label)) && cells.every((cell) => cell.decimal == null)) return { candidate: 'resource_group', rule: 'explicit_resource_group_label' };
  const header = labels.filter((label) => /^(?:№\s*(?:№|П\.?\s*П\.?)?|ОБОСНОВАНИЕ|ШИФР(?:\s.*)?|НАИМЕНОВАНИЕ(?:\s.*)?|ЕД\.?\s*ИЗМ\.?|ЕДИНИЦ[АЫ](?: ИЗМЕРЕНИЯ)?|КОЛ(?:ИЧЕСТВО|-ВО)|ЦЕНА|СУММА|ПРОЦЕНТ|НА ЕДИНИЦУ|ПО ПРОЕКТУ|НА ВЕСЬ ОБЪЕМ|ASOS|ISH VA RESURSLAR NOMI|O['’ʻ]LCHOV BIRLIGI(?: BO['’ʻ]YICHA)?|LOYIHA BO['’ʻ]YICHA|MIQDOR|NARX|SUMMA)$/i.test(label));
  if (header.length >= 2) return { candidate: 'table_header', rule: 'multiple_explicit_column_labels' };
  if (labels.some((label) => /^(?:СОСТАВИЛ|ПРОВЕРИЛ|СОГЛАСОВАНО|УТВЕРЖДАЮ|ПОДПИСЬ|ИСПОЛНИТЕЛЬ|TUZDI|TEKSHIRDI|IMZO)(?:\s|:|$)/i.test(label))) return { candidate: 'signature', rule: 'explicit_signature_label' };
  if (labels.some((label) => /^(?:ПРИМЕЧАНИ[ЕЯ]|ИЗОХ|IZOH|NOTE|ОСНОВАНИЕ|ASOS|ПО ДАННЫМ ОБЪЕКТНЫХ СМЕТ|В ТОМ ЧИСЛЕ)(?:\s|:|$)/i.test(label))) return { candidate: 'note', rule: 'explicit_note_label' };
  if (labels.some((label) => /^(?:ИТОГО|ВСЕГО|НДС|ПРЯМЫЕ ЗАТРАТЫ|ПРОЧИЕ РАСХОДЫ|СТРАХОВАНИЕ|РИСК|QQS|JAMI)(?:\s|[,:%]|$)/i.test(label))) return { candidate: 'financial', rule: 'explicit_financial_label' };
  if (cells.length >= 3 && cells.every((cell, i) => cell.formula == null && cell.decimal === String(i + 1))) return { candidate: 'column_numbers', rule: 'consecutive_column_number_labels' };
  if (labels.some((label) => /^(?:ЛОКАЛЬНАЯ|ОБЪЕКТНАЯ|СВОДНЫЙ|СВОДНАЯ|ФОРМА|АКТ\s|НАИМЕНОВАНИЕ (?:ОБЪЕКТА|СТРОЙКИ)|РАЗДЕЛ\s*[:\d]|QURILISH NOMI|OBYEKT NOMI|LOKAL RESURS BAYONOTI)/i.test(label))) return { candidate: 'title', rule: 'explicit_document_title_label' };
  return cells.some((cell) => cell.decimal != null || cell.formula != null)
    ? { candidate: 'unknown_numeric', rule: 'unassigned_numeric_or_formula_row' }
    : { candidate: 'unknown_text', rule: text ? 'unassigned_text_row' : 'unassigned_nontext_row' };
}

function summary(cells: readonly CellEvidence[]): SourceRowCandidate['summary'] {
  const labels = cells.filter((cell) => typeof cell.raw === 'string').map((cell) => String(cell.raw).trim());
  const rules: Array<[RegExp, NonNullable<SourceRowCandidate['summary']>['metric']]> = [
    [/^(?:ISHCHILARNING MEHNAT XARAJATLARI|ЗАТРАТЫ ТРУДА РАБОЧИХ(?:-СТРОИТЕЛЕЙ)?)$/i, 'labour_quantity'],
    [/^ЗАРАБОТНАЯ ПЛАТА$/i, 'labour_cost'], [/^ЭКСПЛУАТАЦИЯ МАШИН И МЕХАНИЗМОВ$/i, 'machine_cost'],
    [/^СТОИМОСТЬ СТРОИТЕЛЬНЫХ МАТЕРИАЛОВ$/i, 'material_cost'], [/^ПЕРЕВОЗКА$/i, 'transport_cost'], [/^ОБОРУДОВАНИЕ$/i, 'equipment_cost'],
  ];
  const metric = rules.find(([pattern]) => labels.some((label) => pattern.test(label)))?.[1];
  const values = cells.filter((cell) => cell.decimal != null || cell.formula != null);
  if (!metric || !values.length) return undefined;
  const units = cells.filter((cell) => typeof cell.raw === 'string' && /^(?:ЧЕЛ[.\s-]*(?:Ч|ЧАС)|СУМ|UZS|РУБ|USD|EUR)$/i.test(String(cell.raw).trim()));
  return { metric, values, units };
}

/** Every unmapped source row remains visible, including failed classifications. */
export function triageUnassignedRows(document: Pick<WorkbookEvidence, 'sheets'>): SourceRowCandidate[] {
  const output: SourceRowCandidate[] = [];
  for (const sheet of document.sheets) {
    const pending = new Set(sheet.unassignedRows);
    const byRow = new Map<number, CellEvidence[]>();
    for (const cell of sheet.cells) {
      const row = Number(cell.address.replace(/^[A-Z]+/, ''));
      if (!pending.has(row)) continue;
      const entries = byRow.get(row) ?? [];
      entries.push(cell); byRow.set(row, entries);
    }
    for (const row of sheet.unassignedRows) {
      const cells = byRow.get(row) ?? [];
      const sourceSummary = summary(cells);
      output.push({ sheet: sheet.name, row, cells, ...candidate(cells), ...(sourceSummary ? { summary: sourceSummary } : {}), reviewRequired: true });
    }
  }
  return output;
}
