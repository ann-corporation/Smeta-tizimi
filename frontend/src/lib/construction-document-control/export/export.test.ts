import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { generateNakopitelniy } from './nakopitelniy-export';
import { generateForma2 } from './forma2-export';
import { generateForma3 } from './forma3-export';
import { type ProgressLineResult, type ProgressValuationResult } from '../types';

const formulaResult = (value: unknown) => typeof value === 'object' && value !== null && 'result' in value
  ? (value as { result: unknown }).result
  : value;

describe('Document Export Generators', () => {
  const dummyRow: ProgressLineResult = {
    lineId: 'l1',
    sectionId: 's1',
    description: 'Test ish',
    unit: 'm3',
    baselineQuantity: 100,
    baselineReferencePrice: 500,
    approvedChangeQuantity: 20,
    approvedEntitlementQuantity: 120,
    previousQuantity: 50,
    currentQuantity: 30,
    cumulativeQuantity: 80,
    remainingQuantity: 40,
    previousValue: 25000,
    currentValue: 15000,
    cumulativeValue: 40000,
    remainingValue: 20000,
    previousCertifiedValue: 25000,
    currentCertifiedValue: 15000,
    cumulativeCertifiedValue: 40000,
    currentF2ValuationPrice: 500,
    f2ValuationValue: 15000,
    actualValue: 15000,
    variance: 0,
    changeKinds: [],
    revisionIds: [],
    warnings: []
  };

  const dummyValuation: ProgressValuationResult = {
    input: {} as any,
    rows: [dummyRow],
    totals: {
      previousQuantity: 50,
      currentQuantity: 30,
      cumulativeQuantity: 80,
      remainingQuantity: 40,
      previousValue: 25000,
      currentValue: 15000,
      cumulativeValue: 40000,
      remainingValue: 20000,
      previousCertifiedValue: 25000,
      currentCertifiedValue: 15000,
      cumulativeCertifiedValue: 40000
    }
  };

  it('generates Nakopitelniy Vedomost (TPL-07)', async () => {
    const buffer = await generateNakopitelniy([dummyRow], {
      projectName: 'Test Project',
      objectName: 'Test Object',
      periodLabel: '2026-09',
      documentNumber: 'NAK-1'
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer.buffer as ArrayBuffer);
    const ws = wb.getWorksheet(1);
    expect(ws).toBeDefined();
    
    // Header check
    expect(ws!.getCell('A1').value).toContain('Nakopitelnaya vedomost');
    
    // Data check (row 6 should be the first data row)
    const dataRow = ws!.getRow(6);
    expect(dataRow.getCell(1).value).toBe('Test ish');
    expect(dataRow.getCell(3).value).toBe(100);
    expect(dataRow.getCell(7).value).toBe(30); // Joriy F-2 hajmi
    expect(dataRow.getCell(11).value).toBe(15000); // Joriy F-2 original manba summasi
    expect(formulaResult(dataRow.getCell(13).value)).toBe(20000); // Qoldiq summa (smeta nazorati)
    expect((dataRow.getCell(13).value as { formula: string }).formula).toBe('ROUND(I6*O6,2)');
  });

  it('generates Forma-2 (TPL-05/06)', async () => {
    const buffer = await generateForma2([dummyRow], {
      projectName: 'Test Project',
      objectName: 'Test Object',
      periodLabel: '2026-09',
      documentNumber: 'F2-1',
      contractNumber: 'C-123'
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer.buffer as ArrayBuffer);
    const ws = wb.getWorksheet(1);
    expect(ws).toBeDefined();

    expect(ws!.getCell('A1').value).toContain('Forma-2');
    
    const dataRow = ws!.getRow(8); // Data starts at row 8 usually
    expect(dataRow.getCell(2).value).toBe('Test ish');
    expect(dataRow.getCell(5).value).toBe(30); // Joriy oy miqdori
    expect(dataRow.getCell(6).value).toBe(15000); // Sertifikatlangan summa
    expect(formulaResult(dataRow.getCell(7).value)).toBe(15000); // Joriy oy uchun analitik hisob
    expect((dataRow.getCell(7).value as { formula: string }).formula).toBe('ROUND(E8*D8,2)');
  });

  it('keeps a current Forma-2 source amount exact and compares it only with the current-period arithmetic', async () => {
    const exactSourceRow: ProgressLineResult = {
      ...dummyRow,
      currentQuantity: 10,
      currentF2ValuationPrice: 123.45,
      currentCertifiedValue: 1234.49,
      // Bu qasddan kumulyativ qiymat: eksport uni joriy oy farqiga ishlatmasligi kerak.
      f2ValuationValue: 9876.54,
    };
    const buffer = await generateForma2([exactSourceRow], {
      projectName: 'Test Project', objectName: 'Test Object', periodLabel: '2026-09', documentNumber: 'F2-exact',
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer.buffer as ArrayBuffer);
    const dataRow = wb.getWorksheet(1)!.getRow(8);
    expect(dataRow.getCell(6).value).toBe(1234.49);
    expect(formulaResult(dataRow.getCell(7).value)).toBe(1234.5);
    expect(formulaResult(dataRow.getCell(8).value)).toBe(-0.01);
  });

  it('Forma-2 does not fabricate 0 for unknown price/value -- writes NOANIQ instead', async () => {
    const noaniqRow: ProgressLineResult = {
      ...dummyRow,
      currentF2ValuationPrice: null,
      currentCertifiedValue: null,
      f2ValuationValue: null,
      variance: null,
    };
    const buffer = await generateForma2([noaniqRow], {
      projectName: 'Test Project', objectName: 'Test Object',
      periodLabel: '2026-09', documentNumber: 'F2-2',
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer.buffer as ArrayBuffer);
    const ws = wb.getWorksheet(1);
    const dataRow = ws!.getRow(8);
    // Narx/summalar noma'lum -- HECH BIRI 0 emas, "NOANIQ" bo'lishi kerak.
    expect(dataRow.getCell(4).value).toBe('NOANIQ');
    expect(dataRow.getCell(6).value).toBe('NOANIQ');
    expect(dataRow.getCell(7).value).toBe('NOANIQ');
    expect(dataRow.getCell(8).value).toBe('NOANIQ');
    // JAMI qatori ham "to'liq emas" deb belgilangan, soxta 0 jami emas.
    const totalRow = ws!.getRow(9);
    expect(String(totalRow.getCell(2).value)).toContain('TO\'LIQ EMAS');
  });

  it('Nakopitelniy does not fabricate 0 for unknown certified value -- writes NOANIQ instead', async () => {
    const noaniqRow: ProgressLineResult = { ...dummyRow, cumulativeCertifiedValue: null };
    const buffer = await generateNakopitelniy([noaniqRow], {
      projectName: 'Test Project', objectName: 'Test Object',
      periodLabel: '2026-09', documentNumber: 'NAK-2',
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer.buffer as ArrayBuffer);
    const ws = wb.getWorksheet(1);
    const dataRow = ws!.getRow(6);
    expect(dataRow.getCell(12).value).toBe('NOANIQ');
  });

  it('blocks Forma-3 until the legal pricing rule has an authoritative evidence link', async () => {
    await expect(generateForma3(dummyValuation, {
      projectName: 'Test Project',
      objectName: 'Test Object',
      periodLabel: '2026-09',
      documentNumber: 'F3-1',
    })).rejects.toThrow('FORMA3_RULE_UNRESOLVED');
  });

  it('generates Forma-3 only from a named legal rule and evidence', async () => {
    const buffer = await generateForma3(dummyValuation, {
      projectName: 'Test Project',
      objectName: 'Test Object',
      periodLabel: '2026-09',
      documentNumber: 'F3-1',
      legalRuleEvidence: { documentId: 'contract-rule-17', ruleVersion: 'v1', vatRatePercent: 12 }
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer.buffer as ArrayBuffer);
    const ws = wb.getWorksheet(1);
    
    const vatRow = ws!.getRow(9);
    expect(vatRow.getCell(2).value).toContain('QQS (12%, asos: contract-rule-17');
    expect(formulaResult(vatRow.getCell(4).value)).toBe(15000 * 0.12); // QQS joriy davr
    expect((vatRow.getCell(4).value as { formula: string }).formula).toBe('ROUND(D8*0.12,2)');
  });
});
