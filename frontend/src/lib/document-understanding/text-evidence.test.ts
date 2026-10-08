import { describe, expect, it } from 'vitest';
import { analyzeTextEvidence } from './text-evidence';
import { understandText } from './index';

describe('native/OCR semantic source candidates', () => {
  it('finds wrapped F2 titles and explicit fields without choosing a company identity', () => {
    const text = 'АКТ О ПРИЁМКЕ\nВЫПОЛНЕННЫХ РАБОТ\nАКТ № 17/А\nДоговор № D-2026\nЗаказчик: ООО «Пример»\nПодрядчик: ООО «Работа»\nОтчетный период: сентябрь 2026\nИТОГО: 1 234,50 UZS';
    const result = analyzeTextEvidence([{ page: 3, text, origin: 'native' }]);
    expect(result.familyCandidates.some((candidate) => candidate.family === 'f2')).toBe(true);
    expect(result.fields.find((field) => field.field === 'customer')).toMatchObject({ value: 'ООО «Пример»', page: 3, line: 5, reviewRequired: true });
    expect(result.fields.find((field) => field.field === 'total')?.value).toBe('1 234,50');
    expect(result.canonicalWriteAllowed).toBe(false);
  });

  it('keeps multiple document families and conflicting explicit facts for review', () => {
    const result = analyzeTextEvidence([{ page: 1, origin: 'native', text: 'Форма № 2\nФорма № 3\nДоговор № А\nДоговор № Б' }]);
    expect(result.familyCandidates.map((candidate) => candidate.family)).toEqual(expect.arrayContaining(['f2', 'f3']));
    expect(result.fields.filter((field) => field.field === 'contract_number').map((field) => field.value)).toEqual(['А', 'Б']);
  });

  it('validates literal dates, including leap years, without inventing a date from the reporting month', () => {
    const result = analyzeTextEvidence([{ page: 1, origin: 'native', text: '29.02.2024\n29.02.2025\n31.04.2026\nОтчетный период: сентябрь 2026' }]);
    expect(result.fields.filter((field) => field.field === 'date').map((field) => field.value)).toEqual(['29.02.2024']);
    expect(result.issues.filter((issue) => issue.code === 'INVALID_SOURCE_DATE')).toHaveLength(2);
  });

  it('keeps OCR provenance and unknown family even if the text contains numbers', () => {
    const result = analyzeTextEvidence([{ page: 5, origin: 'ocr', text: 'ИТОГО: 0\nНеизвестный документ' }]);
    expect(result.fields[0]).toMatchObject({ field: 'total', value: '0', origin: 'ocr', reviewRequired: true });
    expect(result.issues.some((issue) => issue.code === 'DOCUMENT_FAMILY_UNKNOWN')).toBe(true);
  });

  it('does not fabricate missing monetary values or treat document numbers as totals', () => {
    const result = analyzeTextEvidence([{ page: 1, origin: 'native', text: 'ИТОГО: неизвестно\nАКТ № 1000\nПодрядчик:' }]);
    expect(result.fields.some((field) => field.field === 'total' || field.field === 'contractor')).toBe(false);
    expect(result.fields.find((field) => field.field === 'document_number')?.value).toBe('1000');
  });

  it('does not mistake the form type number for the act identity', () => {
    const result = analyzeTextEvidence([{ page: 1, origin: 'native', text: 'Форма № 2\nАКТ № 17' }]);
    expect(result.fields.filter((field) => field.field === 'document_number').map((field) => field.value)).toEqual(['17']);
    expect(result.familyCandidates.some((candidate) => candidate.family === 'f2')).toBe(true);
  });

  it('attaches semantic evidence to the text port already used by PDF/Word adapters', () => {
    const result = understandText('act.pdf', [{ page: 1, origin: 'native', text: 'Акт освидетельствования скрытых работ' }]);
    expect(result.semantic.familyCandidates[0].family).toBe('hidden_work_act');
    expect(result.importAllowed).toBe(false);
  });
});
