// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as XLSX from 'xlsx';
import { readDocumentFile } from './file';

const manifestPath = process.env.DOCUMENT_CORPUS_MANIFEST;
type Source = { path: string; sha256: string; kind: 'spreadsheet' | 'pdf' | 'docx' };
const sources: Source[] = manifestPath ? JSON.parse(readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, '')).sources : [];

describe.skipIf(!manifestPath)('local real document evidence corpus', () => {
  it('reads immutable originals and preserves spreadsheet physical cell locations and values', async () => {
    expect(sources.length).toBeGreaterThan(0);
    const records: unknown[] = [];
    for (const source of sources) {
      const bytes = readFileSync(source.path);
      const before = createHash('sha256').update(bytes).digest('hex');
      expect(before).toBe(source.sha256);
      const result = await readDocumentFile(source.path, bytes);
      expect(result.kind).toBe(source.kind);
      expect(result.identity.sha256).toBe(before);
      expect(result.importAllowed).toBe(false);
      if (result.kind === 'spreadsheet') {
        // Independent physical OOXML/BIFF cell grid, not the semantic parser's output.
        const original = XLSX.read(bytes, { type: 'buffer', cellFormula: true });
        let verifiedCells = 0;
        expect(result.evidence.sheets.map((s) => s.name)).toEqual(original.SheetNames);
        for (const sheet of result.evidence.sheets) {
          const byAddress = new Map(sheet.cells.map((cell) => [cell.address, cell]));
          for (const [address, cell] of Object.entries(original.Sheets[sheet.name])) {
            if (address.startsWith('!')) continue;
            const originalCell = cell as XLSX.CellObject;
            if (originalCell.v == null || originalCell.v === '') continue;
            const found = byAddress.get(address);
            expect(found, `${sheet.name}!${address}`).toBeDefined();
            expect(String(found!.raw), `${sheet.name}!${address}`).toBe(String(originalCell.v));
            verifiedCells++;
          }
        }
        records.push({ path: source.path, sha256: before, kind: result.kind, verifiedCells,
          coverage: result.evidence.coverage,
          sheets: result.evidence.sheets.map((s) => ({ name: s.name, formulas: s.formulas.length, rateCandidates: s.rates.length, unassignedRows: s.unassignedRows.length })),
          reviewIssues: result.evidence.issues.length });
      } else if (result.kind === 'pdf') {
        expect(result.evidence.pages.length).toBeGreaterThan(0);
        records.push({ path: source.path, sha256: before, kind: result.kind, pages: result.evidence.pages.length, ocrRequired: result.review.length });
      } else if (result.kind === 'docx') {
        expect(result.evidence.length).toBeGreaterThan(0);
        records.push({ path: source.path, sha256: before, kind: result.kind, parts: result.evidence.map((part) => part.part) });
      }
      expect(createHash('sha256').update(readFileSync(source.path)).digest('hex')).toBe(before);
    }
    if (process.env.DOCUMENT_CORPUS_RECEIPT) writeFileSync(process.env.DOCUMENT_CORPUS_RECEIPT, JSON.stringify({ status: 'SOURCE_TRANSPORT_VERIFIED', semanticAcceptance: 'NOT_PROVEN', records }, null, 2));
  }, 300_000);
});
