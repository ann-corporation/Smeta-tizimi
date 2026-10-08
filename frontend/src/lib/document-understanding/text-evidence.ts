export interface TextPageSource { page: number; text: string; origin: 'native' | 'ocr' }
export type DocumentFamily = 'estimate' | 'f2' | 'f3' | 'm29' | 'hidden_work_act' | 'invoice' | 'contract' | 'lab_protocol';
export interface TextCandidate {
  page: number;
  line: number;
  raw: string;
  rule: string;
  origin: 'native' | 'ocr';
  reviewRequired: true;
}
export interface TextFieldCandidate extends TextCandidate {
  field: 'contract_number' | 'document_number' | 'customer' | 'contractor' | 'period' | 'date' | 'total';
  value: string;
}

const families: Array<[DocumentFamily, RegExp]> = [
  ['f2', /ФОРМ[АЫ]\s*№?\s*0?2(?:\b|\s)|АКТ\s+О\s+ПРИ[ЁЕ]МКЕ\s+ВЫПОЛНЕННЫХ\s+РАБОТ|\bF[- ]?2\b/iu],
  ['f3', /ФОРМ[АЫ]\s*№?\s*0?3(?:\b|\s)|СПРАВКА\s+О\s+СТОИМОСТИ\s+ВЫПОЛНЕННЫХ\s+РАБОТ|\bF[- ]?3\b/iu],
  ['m29', /М[- ]?29\b|M[- ]?29\b|ОТЧ[ЁЕ]Т\s+О\s+РАСХОДЕ\s+МАТЕРИАЛОВ/iu],
  ['hidden_work_act', /ОСВИДЕТЕЛЬСТВОВАНИ[ЯЕ]\s+СКРЫТЫХ\s+РАБОТ|ЯШИРИН\s+ИШЛАР|YASHIRIN\s+ISHLAR/iu],
  ['estimate', /ЛОКАЛЬНАЯ\s+(?:РЕСУРСНАЯ\s+ВЕДОМОСТЬ|СМЕТА)|ЛОКАЛЬНЫЙ\s+СМЕТНЫЙ\s+РАСЧ[ЁЕ]Т|ОБЪЕКТНАЯ\s+СМЕТА/iu],
  ['invoice', /СЧ[ЁЕ]Т[- ]ФАКТУРА|HISOB[- ]FAKTURA|\bINVOICE\b/iu],
  ['contract', /^(?:ДОГОВОР|SHARTNOMA|CONTRACT)(?:\s|№|$)/iu],
  ['lab_protocol', /ПРОТОКОЛ\s+(?:ИСПЫТАНИЙ|ЛАБОРАТОРН)|SINOV\s+BAYONNOMASI/iu],
];

function validDate(text: string): boolean {
  const [day, month, year] = text.split('.').map(Number);
  if (year < 1000 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
}

/** Explicit source labels produce candidates, never canonical IDs or approval. */
export function analyzeTextEvidence(pages: readonly TextPageSource[]) {
  const familyCandidates: Array<TextCandidate & { family: DocumentFamily }> = [];
  const fields: TextFieldCandidate[] = [];
  const normReferences: Array<TextCandidate & { code: string }> = [];
  const publicationMarkers: Array<TextCandidate & { marker: 'draft' | 'official_edition' }> = [];
  const issues: Array<{ page: number; line: number; code: string; raw: string }> = [];
  for (const page of pages) {
    const lines = page.text.split(/\r\n|\n|\r/);
    const seenFamily = new Set<DocumentFamily>();
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const evidence: TextCandidate = { page: page.page, line: i + 1, raw, rule: 'explicit_source_label', origin: page.origin, reviewRequired: true };
      // A reference identifies cited text, never its current legal validity.
      for (const match of raw.matchAll(/(?:ШН[КҚ]|SHN[QK]|КМК|QMQ)\s*\d{1,2}\.\d{2}\.\d{2}\s*[-–—]\s*\d{2,4}/giu)) {
        normReferences.push({ ...evidence, rule: 'literal_norm_reference', code: match[0] });
      }
      if (/^\s*(?:ПРОЕКТ|ЛОЙИҲА|LOYIHA|DRAFT)\s*$/iu.test(raw)) publicationMarkers.push({ ...evidence, rule: 'standalone_publication_marker', marker: 'draft' });
      if (/^\s*(?:ОФИЦИАЛЬНОЕ ИЗДАНИЕ|РАСМИЙ НАШР|RASMIY NASHR)\s*$/iu.test(raw)) publicationMarkers.push({ ...evidence, rule: 'standalone_publication_marker', marker: 'official_edition' });
      // Titles may wrap. Keep the original lines; the regex uses whitespace only.
      if (i < 40) {
        const window = lines.slice(i, i + 3).join('\n');
        for (const [family, pattern] of families) {
          if (!seenFamily.has(family) && pattern.test(window.trim())) {
            familyCandidates.push({ ...evidence, raw: window, rule: 'explicit_title_candidate', family }); seenFamily.add(family);
          }
        }
      }
      const numberRules: Array<[TextFieldCandidate['field'], RegExp]> = [
        ['contract_number', /(?:ДОГОВОР(?:А)?|SHARTNOMA|CONTRACT)\s*№\s*([^\s,;]+)/iu],
        ['document_number', /(?:АКТ|ПРОТОКОЛ|СЧ[ЁЕ]Т[- ]ФАКТУРА)\s*№\s*([^\s,;]+)/iu],
        ['customer', /^\s*(?:ЗАКАЗЧИК|BUYURTMACHI|CUSTOMER)\s*:\s*(.+)$/iu],
        ['contractor', /^\s*(?:ПОДРЯДЧИК|PUDRATCHI|CONTRACTOR)\s*:\s*(.+)$/iu],
        ['period', /^\s*(?:ОТЧ[ЁЕ]ТНЫЙ\s+ПЕРИОД|HISOBOT\s+DAVRI|REPORTING\s+PERIOD)\s*:\s*(.+)$/iu],
        ['total', /^\s*(?:ИТОГО|ВСЕГО|JAMI|TOTAL)\s*:?\s*([+-]?\d[\d \u00a0\u202f]*(?:[.,]\d+)?)\s*(?:UZS|СУМ|РУБ|USD|EUR|$)/iu],
      ];
      for (const [field, pattern] of numberRules) {
        const match = raw.match(pattern);
        if (match) fields.push({ ...evidence, field, value: match[1] });
      }
      for (const match of raw.matchAll(/(?<!\d)\d{2}\.\d{2}\.\d{4}(?!\d)/g)) {
        if (validDate(match[0])) fields.push({ ...evidence, rule: 'explicit_calendar_date', field: 'date', value: match[0] });
        else issues.push({ page: page.page, line: i + 1, code: 'INVALID_SOURCE_DATE', raw });
      }
    }
  }
  if (!familyCandidates.length) issues.push({ page: pages[0]?.page ?? 0, line: 0, code: 'DOCUMENT_FAMILY_UNKNOWN', raw: '' });
  return { familyCandidates, fields, issues, normReferences, publicationMarkers, normativeActivationAllowed: false as const, canonicalWriteAllowed: false as const };
}
