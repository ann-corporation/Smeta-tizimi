// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildZip } from '../f2-import-parse/testFixtures';
import { readDocumentFile } from './file';

describe('universal file evidence adapters', () => {
  it('retains Word body, tables, headers and footnotes with original XML and logical locations', async () => {
    const body = '<w:document><w:body><w:p><w:r><w:t>Акт &amp; договор</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>12,50</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>';
    const bytes = buildZip({ 'word/document.xml': body, 'word/header1.xml': '<w:p><w:r><w:t>Заказчик</w:t></w:r></w:p>', 'word/footnotes.xml': '<w:p><w:r><w:t>Примечание</w:t></w:r></w:p>' });
    const original = bytes.slice();
    const result = await readDocumentFile('act.docx', bytes);
    expect(bytes).toEqual(original);
    expect(result.kind).toBe('docx');
    if (result.kind !== 'docx') throw new Error('wrong adapter');
    expect(result.evidence).toHaveLength(3);
    expect(result.evidence[0].rawXml).toBe(body);
    expect(result.evidence[0].evidence.pages[0].text).toContain('Акт & договор\n');
    expect(result.evidence[0].locationKind).toBe('logical_part');
    expect(result.identity.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.importAllowed).toBe(false);
  });

  it('keeps text numbers, whitespace and line evidence without pretending to map a CSV schema', async () => {
    const text = 'Название;Сумма\r\n  Работа  ;12,50\r\n';
    const result = await readDocumentFile('source.csv', new TextEncoder().encode(text));
    expect(result.kind).toBe('text');
    if (result.kind !== 'text') throw new Error('wrong adapter');
    expect(result.evidence.pages[0].text).toBe(text);
    expect(result.evidence.pages[0].review).toBe('SEMANTIC_MAPPING_REQUIRED');
  });

  it('rejects unproven encodings without silently replacing characters', async () => {
    await expect(readDocumentFile('source.txt', new Uint8Array([0xff, 0xff]))).rejects.toThrow();
  });

  it('keeps unsupported binary identity and does not invent content', async () => {
    const result = await readDocumentFile('source.dwg', new Uint8Array([1, 2, 3]));
    expect(result.kind).toBe('unsupported');
    if (result.kind !== 'unsupported') throw new Error('wrong adapter');
    expect(result.review).toBe('FORMAT_ADAPTER_REQUIRED');
    expect(result.identity.bytes).toBe(3);
  });

  it('rejects malformed Word packages', async () => {
    await expect(readDocumentFile('missing.docx', buildZip({ 'other.xml': 'unknown' }))).rejects.toThrow('DOCX_BODY_MISSING');
  });
});
