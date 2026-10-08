import { readXlsxFonda } from '../f2-import-parse/xlsxFonda';
import { understandWorkbook, type DocumentUnderstanding } from './index';

/** Reuses the canonical binary reader. Original bytes stay with the caller. */
export async function readDocumentWorkbook(file: string, bytes: ArrayBuffer | Uint8Array): Promise<DocumentUnderstanding> {
  const workbook = await readXlsxFonda(bytes);
  return understandWorkbook({ fayl: file, varaqlar: workbook.sheets.map((sheet) => ({
    nom: sheet.name, rows: sheet.rows, merges: sheet.merges, outline: sheet.outline,
    formulalar: sheet.formulalar, numericText: sheet.numericText,
  })) });
}
