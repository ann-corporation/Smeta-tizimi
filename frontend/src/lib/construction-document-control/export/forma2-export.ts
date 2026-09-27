import ExcelJS from 'exceljs';
import { type ProgressLineResult } from '../types';

export interface Forma2ExportOptions {
  projectName: string;
  objectName: string;
  periodLabel: string;
  documentNumber: string;
  contractNumber?: string;
}

export async function generateForma2(
  rows: readonly ProgressLineResult[],
  options: Forma2ExportOptions
): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Smeta tizimi';
  const worksheet = workbook.addWorksheet('Forma-2');

  // Header meta
  worksheet.mergeCells('A1', 'J1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = `Bajarilgan ishlar dalolatnomasi (Forma-2)`;
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { horizontal: 'center' };

  worksheet.getCell('A2').value = `Obyekt: ${options.projectName} - ${options.objectName}`;
  worksheet.getCell('A3').value = `Hujjat raqami: ${options.documentNumber}`;
  worksheet.getCell('A4').value = `Shartnoma: ${options.contractNumber ?? 'Noma\'lum'}`;
  worksheet.getCell('A5').value = `Davr: ${options.periodLabel}`;
  
  for(let i=2; i<=5; i++) {
    worksheet.mergeCells(`A${i}`, `J${i}`);
  }

  worksheet.addRow([]); // empty row

  // Table headers (TPL-06)
  const headerRow1 = worksheet.addRow([
    'T/r',
    'Ishlar nomi',
    'Birlik',
    'Birlik narxi',
    'Joriy oy miqdori',
    'Sertifikatlangan summa (original)',
    'Hisoblangan summa',
    'Farq',
    'Oldingi miqdor',
    'Jami miqdor'
  ]);

  headerRow1.font = { bold: true };
  headerRow1.eachCell((cell) => {
    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
    cell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
  });

  // Data rows.
  // ⚠️ NARX O'ZIDAN TO'QILMAYDI: qiymat noma'lum (null) bo'lsa hujjatda
  // "NOANIQ" deb yoziladi, HECH QACHON 0 emas -- 0 "aniq nol" degani,
  // noma'lum bilan bir xil emas (masalan bir necha xil narx aralashgan
  // yoki manba narxi hali qayd etilmagan bo'lishi mumkin).
  const NOANIQ = 'NOANIQ';
  let index = 1;
  let totalSertSum = 0;
  let totalHisobSum = 0;
  let jamiNoaniq = false;
  const dataRowNumbers: number[] = [];

  rows.forEach((row) => {
    // Only output rows that have current quantity or value (F-2 is for current period)
    if (row.currentQuantity === 0 && !row.currentCertifiedValue) return;

    const certValNoaniq = row.currentCertifiedValue == null;
    // Bu faqat analitik tekshiruv. Asl sertifikatlangan summa hech qachon
    // shu ko'paytmaga almashtirilmaydi. Muhimi: hisob JORIY davr miqdoridan
    // quriladi; kumulyativ F2 qiymatini joriy oy bilan solishtirish xato.
    const currentCalculatedValue = row.currentF2ValuationPrice == null
      ? null
      : Math.round((row.currentQuantity * row.currentF2ValuationPrice + Number.EPSILON) * 100) / 100;
    const calcValNoaniq = currentCalculatedValue == null;
    const narxNoaniq = row.currentF2ValuationPrice == null;
    const currentArithmeticDifference = certValNoaniq || calcValNoaniq
      ? null
      : Math.round(((row.currentCertifiedValue as number) - (currentCalculatedValue as number) + Number.EPSILON) * 100) / 100;
    const farqNoaniq = currentArithmeticDifference == null;
    if (certValNoaniq || calcValNoaniq) jamiNoaniq = true;
    if (!certValNoaniq) totalSertSum += row.currentCertifiedValue as number;
    if (!calcValNoaniq) totalHisobSum += currentCalculatedValue as number;

    const excelRow = worksheet.rowCount + 1;
    const liveCalculatedValue = calcValNoaniq ? NOANIQ : { formula: `ROUND(E${excelRow}*D${excelRow},2)`, result: currentCalculatedValue as number };
    const liveDifference = farqNoaniq ? NOANIQ : { formula: `F${excelRow}-G${excelRow}`, result: currentArithmeticDifference as number };
    const liveCumulativeQuantity = { formula: `I${excelRow}+E${excelRow}`, result: row.cumulativeQuantity };
    const dataRow = worksheet.addRow([
      index++,
      row.description,
      row.unit,
      narxNoaniq ? NOANIQ : row.currentF2ValuationPrice,
      row.currentQuantity,
      certValNoaniq ? NOANIQ : row.currentCertifiedValue,
      liveCalculatedValue,
      liveDifference,
      row.previousQuantity,
      liveCumulativeQuantity
    ]);
    dataRowNumbers.push(dataRow.number);

    dataRow.eachCell((cell, colNumber) => {
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      if (colNumber >= 4 && colNumber <= 10 && (typeof cell.value === 'number' || (typeof cell.value === 'object' && cell.value !== null))) cell.numFmt = '#,##0.00';
      if (cell.value === NOANIQ) cell.font = { color: { argb: 'FFFF0000' }, italic: true };
    });

    if (currentArithmeticDifference !== null && Math.abs(currentArithmeticDifference) > 0.01) {
      dataRow.getCell(8).font = { color: { argb: 'FFFF0000' }, bold: true };
    }
  });

  // Footer totals. Agar biror qatorda summasi noma'lum bo'lsa, JAMI ham
  // "to'liq emas" deb aniq belgilanadi -- soxta, kamaytirilgan jami
  // hech qachon yakuniy raqam sifatida ko'rsatilmaydi.
  const firstDataRow = dataRowNumbers[0];
  const lastDataRow = dataRowNumbers[dataRowNumbers.length - 1];
  const totalRowNumber = worksheet.rowCount + 1;
  const totalCertCell = !jamiNoaniq && firstDataRow != null && lastDataRow != null
    ? { formula: `SUM(F${firstDataRow}:F${lastDataRow})`, result: totalSertSum }
    : (jamiNoaniq ? NOANIQ : totalSertSum);
  const totalCalcCell = !jamiNoaniq && firstDataRow != null && lastDataRow != null
    ? { formula: `SUM(G${firstDataRow}:G${lastDataRow})`, result: totalHisobSum }
    : (jamiNoaniq ? NOANIQ : totalHisobSum);
  const totalDiffCell = !jamiNoaniq && firstDataRow != null && lastDataRow != null
    ? { formula: `F${totalRowNumber}-G${totalRowNumber}`, result: totalSertSum - totalHisobSum }
    : (jamiNoaniq ? NOANIQ : totalSertSum - totalHisobSum);
  const totalRow = worksheet.addRow([
    '', jamiNoaniq ? 'JAMI JORIY OY UCHUN (TO\'LIQ EMAS -- ba\'zi narx/summa noaniq):' : 'JAMI JORIY OY UCHUN:',
    '', '', '',
    totalCertCell, totalCalcCell, totalDiffCell, '', ''
  ]);
  totalRow.font = { bold: true };
  totalRow.eachCell((cell, colNumber) => {
    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    if (colNumber >= 6 && colNumber <= 8) cell.numFmt = '#,##0.00';
  });
  if (jamiNoaniq) totalRow.getCell(2).font = { bold: true, color: { argb: 'FFFF0000' } };
  worksheet.mergeCells(`B${totalRow.number}`, `E${totalRow.number}`);
  totalRow.getCell(2).alignment = { horizontal: 'right' };

  // Adjust column widths
  worksheet.getColumn(1).width = 5;
  worksheet.getColumn(2).width = 45;
  worksheet.getColumn(3).width = 10;
  for (let i = 4; i <= 10; i++) {
    worksheet.getColumn(i).width = 15;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}
