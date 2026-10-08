import { unzipSync } from 'fflate';
import { understandText } from './evidence';
import { readDocumentWorkbook } from './reader';

export type TextUnderstanding = ReturnType<typeof understandText>;
export type FileUnderstanding = Awaited<ReturnType<typeof readDocumentFile>>;

function xmlText(xml: string): string {
  // Preserve native Word paragraph/cell boundaries, never execute XML fields.
  return xml.replace(/<\/w:p>/g, '\n').replace(/<\/w:tc>/g, '\t').replace(/<w:br\b[^>]*\/>/g, '\n')
    .replace(/<w:tab\b[^>]*\/>/g, '\t').replace(/<[^>]*>/g, '')
    .replace(/&#x([\da-f]+);/gi, (_, value: string) => String.fromCodePoint(parseInt(value, 16)))
    .replace(/&#(\d+);/g, (_, value: string) => String.fromCodePoint(Number(value)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

/** All formats return evidence/review, never executable content or a DB command. */
export async function readDocumentFile(file: string, input: ArrayBuffer | Uint8Array) {
  const bytes = Uint8Array.from(input instanceof Uint8Array ? input : new Uint8Array(input));
  if (bytes.byteLength > 100 * 1024 * 1024) throw new Error('DOCUMENT_SIZE_LIMIT');
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const identity = { file, bytes: bytes.byteLength, sha256: Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('') };
  const prefix = new TextDecoder().decode(bytes.subarray(0, 8));
  if (/\.(xlsx?|xlsm)$/i.test(file)) {
    return { kind: 'spreadsheet' as const, identity, evidence: await readDocumentWorkbook(file, bytes), importAllowed: false as const };
  }
  if (prefix.startsWith('%PDF-')) {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: bytes });
    try {
      const result = await parser.getText();
      const evidence = understandText(file, result.pages.map((page, i) => ({ page: i + 1, text: page.text, origin: 'native' as const })));
      return { kind: 'pdf' as const, identity, evidence,
        review: evidence.pages.filter((page) => !page.text.trim()).map((page) => ({ page: page.page, code: 'OCR_REQUIRED' })), importAllowed: false as const };
    } finally { await parser.destroy(); }
  }
  if (/\.docx$/i.test(file) && bytes[0] === 0x50 && bytes[1] === 0x4b) {
    let expanded = 0;
    let tooLarge = false;
    const parts = unzipSync(bytes, { filter: (entry) => {
      if (!/^word\/(?:document|header\d*|footer\d*|footnotes|endnotes)\.xml$/.test(entry.name)) return false;
      expanded += entry.originalSize;
      if (expanded > 50 * 1024 * 1024) { tooLarge = true; return false; }
      return true;
    } });
    if (tooLarge) throw new Error('DOCUMENT_EXPANDED_SIZE_LIMIT');
    if (!parts['word/document.xml']) throw new Error('DOCX_BODY_MISSING');
    const evidence = Object.entries(parts).map(([part, data]) => {
      const rawXml = new TextDecoder('utf-8', { fatal: true }).decode(data);
      return { part, rawXml, evidence: understandText(`${file}#${part}`, [{ page: 1, text: xmlText(rawXml), origin: 'native' }]),
        locationKind: 'logical_part' as const };
    });
    return { kind: 'docx' as const, identity, evidence, importAllowed: false as const };
  }
  if (/\.(txt|csv|tsv)$/i.test(file)) {
    // Do not replace invalid encoding bytes with invented text.
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { kind: 'text' as const, identity, evidence: understandText(file, [{ page: 1, text, origin: 'native' }]), importAllowed: false as const };
  }
  return { kind: 'unsupported' as const, identity, review: 'FORMAT_ADAPTER_REQUIRED', importAllowed: false as const };
}
