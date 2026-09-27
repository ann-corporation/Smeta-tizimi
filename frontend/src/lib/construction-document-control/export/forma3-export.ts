import ExcelJS from 'exceljs';
import { type ProgressValuationResult } from '../types';

export interface Forma3ExportOptions {
  projectName: string;
  objectName: string;
  periodLabel: string;
  documentNumber: string;
  contractNumber?: string;
  /**
   * Shartnoma/buxgalteriya tomonidan tasdiqlangan qoida dalilisiz Forma-3
   * hisoblanmaydi. Oddiy QQS foizi yetarli emas: u qaysi hujjatga tegishli
   * ekanini ham ko'rsatish shart.
   */
  legalRuleEvidence?: {
    documentId: string;
    ruleVersion: string;
    vatRatePercent: number;
  };
}

export async function generateForma3(
  valuation: ProgressValuationResult,
  options: Forma3ExportOptions
): Promise<Uint8Array> {
  if (!options.legalRuleEvidence) throw new Error('FORMA3_RULE_UNRESOLVED');
  if (!Number.isFinite(options.legalRuleEvidence.vatRatePercent) || options.legalRuleEvidence.vatRatePercent < 0) {
    throw new Error('FORMA3_RULE_INVALID');
  }
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Smeta tizimi';
  const worksheet = workbook.addWorksheet('Forma-3');

  worksheet.mergeCells('A1', 'E1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = 'Bajarilgan ishlar qiymati ma\'lumotnomasi-hisobvaraq-faktura (Forma-3)';
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { horizontal: 'center' };

  worksheet.getCell('A2').value = `Obyekt: ${options.projectName} - ${options.objectName}`;
  worksheet.getCell('A3').value = `Shartnoma: ${options.contractNumber ?? 'Noma\'lum'}`;
  worksheet.getCell('A4').value = `Hujjat raqami: ${options.documentNumber}`;
  worksheet.getCell('A5').value = `Davr: ${options.periodLabel}`;

  for(let i=2; i<=5; i++) {
    worksheet.mergeCells(`A${i}`, `E${i}`);
  }

  worksheet.addRow([]);

  // Table headers (TPL-12 logic)
  const headerRow = worksheet.addRow([
    'T/r',
    'Ko\'rsatkichlar',
    'Oldingi davrgacha jami',
    'Joriy davr',
    'Boshlangandan beri jami'
  ]);
  
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
    cell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
  });

  // Forma-3 progress value is based on approved F2 source amounts, not on
  // baseline estimate quantity × price. The latter remains a separate control
  // fact in the workbench.
  const { previousCertifiedValue, currentCertifiedValue, cumulativeCertifiedValue } = valuation.totals;
  const valuationUnknown = previousCertifiedValue === null || currentCertifiedValue === null || cumulativeCertifiedValue === null;

  const dataRow = worksheet.addRow([
    '1',
    'Bajarilgan ishlar qiymati (QQSsiz)',
    valuationUnknown ? 'FORMA3_RULE_UNRESOLVED' : previousCertifiedValue,
    valuationUnknown ? 'FORMA3_RULE_UNRESOLVED' : currentCertifiedValue,
    valuationUnknown ? 'FORMA3_RULE_UNRESOLVED' : cumulativeCertifiedValue
  ]);

  dataRow.eachCell((cell, colNumber) => {
    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    if (colNumber >= 3) cell.numFmt = '#,##0.00';
  });

  type FormulaCell = { formula: string; result: number };
  let prevVat: number | string | FormulaCell = 'FORMA3_RULE_UNRESOLVED';
  let curVat: number | string | FormulaCell = 'FORMA3_RULE_UNRESOLVED';
  let cumVat: number | string | FormulaCell = 'FORMA3_RULE_UNRESOLVED';

  let prevTotal: number | string | FormulaCell = 'FORMA3_RULE_UNRESOLVED';
  let curTotal: number | string | FormulaCell = 'FORMA3_RULE_UNRESOLVED';
  let cumTotal: number | string | FormulaCell = 'FORMA3_RULE_UNRESOLVED';

  if (!valuationUnknown) {
    const rate = options.legalRuleEvidence.vatRatePercent / 100;
    prevVat = { formula: `ROUND(C8*${rate},2)`, result: previousCertifiedValue! * rate };
    curVat = { formula: `ROUND(D8*${rate},2)`, result: currentCertifiedValue! * rate };
    cumVat = { formula: `ROUND(E8*${rate},2)`, result: cumulativeCertifiedValue! * rate };

    prevTotal = { formula: 'C8+C9', result: previousCertifiedValue + previousCertifiedValue * rate };
    curTotal = { formula: 'D8+D9', result: currentCertifiedValue + currentCertifiedValue * rate };
    cumTotal = { formula: 'E8+E9', result: cumulativeCertifiedValue + cumulativeCertifiedValue * rate };
  }

  const vatRow = worksheet.addRow([
    '2',
    `QQS (${options.legalRuleEvidence.vatRatePercent}%, asos: ${options.legalRuleEvidence.documentId}, qoida: ${options.legalRuleEvidence.ruleVersion})`,
    prevVat,
    curVat,
    cumVat
  ]);

  const totalRow = worksheet.addRow([
    '3',
    'JAMI QQS BILAN:',
    prevTotal,
    curTotal,
    cumTotal
  ]);

  [vatRow, totalRow].forEach(row => {
    row.eachCell((cell, colNumber) => {
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      if ((typeof cell.value === 'number' || (typeof cell.value === 'object' && cell.value !== null && 'formula' in cell.value)) && colNumber >= 3) {
        cell.numFmt = '#,##0.00';
      }
      if (cell.value === 'FORMA3_RULE_UNRESOLVED') {
        cell.font = { color: { argb: 'FFFF0000' }, italic: true };
      }
    });
  });
  totalRow.font = { bold: true };

  worksheet.getColumn(1).width = 5;
  worksheet.getColumn(2).width = 45;
  worksheet.getColumn(3).width = 25;
  worksheet.getColumn(4).width = 25;
  worksheet.getColumn(5).width = 25;

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}
