// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { strToU8, zipSync, zlibSync } from 'fflate';
import { MATN_MAX_KIRISH, matnAjrat, matnAjratadimi, parchaTop, qidiruvNorm, qidiruvSozlar } from './hujjat-matn';

const enc = (s: string) => new TextEncoder().encode(s);
const pdfBayt = (oqimlar: Array<{ govda?: string; flate?: boolean; mazmun: string }>) => {
  let s = '%PDF-1.4\n';
  oqimlar.forEach((o, i) => { s += `${i + 1} 0 obj\n<< ${o.flate ? '/Filter /FlateDecode ' : ''}/Length 0 >>\nstream\n@@${i}@@\nendstream\nendobj\n`; });
  s += '%%EOF';
  // oqimlarni bayt darajasida joylash (flate ikkilik)
  const parts: Uint8Array[] = []; let qol = s;
  oqimlar.forEach((o, i) => {
    const [bosh, dum] = qol.split(`@@${i}@@`); parts.push(enc(bosh)); parts.push(o.flate ? zlibSync(enc(o.mazmun)) : enc(o.mazmun)); qol = dum;
  });
  parts.push(enc(qol));
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0)); let n = 0; for (const p of parts) { out.set(p, n); n += p.length; }
  return out;
};

describe('qidiruvNorm / qidiruvSozlar: lotin-kirill, apostrof va registr farqsiz', () => {
  it('kirill -> lotin, apostrof tushiriladi, faqat [a-z0-9] so‘zlar', () => {
    expect(qidiruvNorm('БЕТОН Арматура')).toBe('beton armatura');
    expect(qidiruvNorm("O‘zbekiston, g'isht #5")).toBe('ozbekiston gisht 5');
    expect(qidiruvNorm('Ўзбекистон')).toBe(qidiruvNorm('Ozbekiston'));
    expect(qidiruvNorm(null)).toBe('');
  });
  it('so‘zlar: >= 2 belgi, takrorsiz, <= 6 ta', () => {
    expect(qidiruvSozlar('a beton beton sement 1')).toEqual(['beton', 'sement']);
    expect(qidiruvSozlar('a b c d e f g h')).toEqual([]);
    expect(qidiruvSozlar('aa bb cc dd ee ff gg hh')).toHaveLength(6);
  });
});

describe('matnAjrat', () => {
  it('oddiy matn va turini aniqlash', () => {
    expect(matnAjratadimi('a.pdf', '')).toBe(true);
    expect(matnAjratadimi('a.DOCX', 'application/octet-stream')).toBe(true);
    expect(matnAjratadimi('a.png', 'image/png')).toBe(false);
    expect(matnAjratadimi('x', 'text/plain')).toBe(true);
    expect(matnAjrat('a.txt', 'text/plain', enc('Beton va armatura: poydevor uchun kerakli materiallar ro‘yxati'))).toContain('armatura');
  });
  it('foydali matn yo‘q (juda qisqa) yoki rasm/noma’lum tur = bo‘sh', () => {
    expect(matnAjrat('a.txt', 'text/plain', enc('x'))).toBe('');
    expect(matnAjrat('a.png', 'image/png', enc('Beton va armatura uzun matn uzun matn'))).toBe('');
    expect(matnAjrat('a.txt', 'text/plain', new Uint8Array(0))).toBe('');
  });
  it('docx: paragraflar, tab, entitetlar', () => {
    const xml = '<w:document><w:body><w:p><w:r><w:t>Smeta &amp; hisob-kitob</w:t></w:r></w:p><w:p><w:r><w:t>Beton</w:t></w:r><w:tab/><w:r><w:t>armatura sement</w:t></w:r></w:p></w:body></w:document>';
    const t = matnAjrat('s.docx', '', zipSync({ 'word/document.xml': strToU8(xml), 'word/media/x.png': new Uint8Array([1, 2, 3]) }));
    expect(t).toContain('Smeta & hisob-kitob');
    expect(t).toContain('Beton armatura sement');
    expect(t.split('\n')).toHaveLength(2);
  });
  it('xlsx: varaq nomlari va umumiy satrlar (sharedStrings)', () => {
    const wb = '<workbook><sheets><sheet name="Smeta 1-lot" sheetId="1"/><sheet name="Ресурслар" sheetId="2"/></sheets></workbook>';
    const ss = '<sst><si><t>Beton M300</t></si><si><r><t>Armatura </t></r><r><t>A500C</t></r></si></sst>';
    const t = matnAjrat('s.xlsx', '', zipSync({ 'xl/workbook.xml': strToU8(wb), 'xl/sharedStrings.xml': strToU8(ss) }));
    expect(t).toContain('Smeta 1-lot'); expect(t).toContain('Ресурслар'); expect(t).toContain('Beton M300'); expect(t).toContain('Armatura A500C');
  });
  it('pptx: slayd matnlari', () => {
    const t = matnAjrat('s.pptx', '', zipSync({ 'ppt/slides/slide1.xml': strToU8('<p:sld><a:p><a:r><a:t>Loyiha taqdimoti: poydevor ishlari</a:t></a:r></a:p></p:sld>') }));
    expect(t).toContain('poydevor ishlari');
  });
  it('pdf: siqilmagan va Flate oqim, Tj/TJ, escape', () => {
    const plain = pdfBayt([{ mazmun: 'BT /F1 12 Tf 72 700 Td (Shartnoma raqami 15 \\(beton\\) ishlari) Tj ET' }]);
    expect(matnAjrat('a.pdf', '', plain)).toContain('Shartnoma raqami 15 (beton) ishlari');
    const flate = pdfBayt([{ flate: true, mazmun: 'BT [(Armatura) -300 (A500C) 20 (sement)] TJ T* (ikkinchi qator matni) Tj ET' }]);
    const t = matnAjrat('a.pdf', 'application/pdf', flate);
    expect(t).toContain('Armatura A500C'); expect(t).toContain('sement'); expect(t).toContain('ikkinchi qator matni');
  });
  it('pdf: ToUnicode xaritasi (CID hex) bilan kirill matn', () => {
    const cmap = '/CIDInit begincmap 6 beginbfchar <0001> <0431> <0002> <0435> <0003> <0442> <0004> <043E> <0005> <043D> <0006> <0020> endbfchar endcmap';
    const kod = '000100020003000400050006'.repeat(4);
    const b = pdfBayt([{ flate: true, mazmun: cmap }, { flate: true, mazmun: `BT /F1 10 Tf <${kod}> Tj ET` }]);
    const t = matnAjrat('a.pdf', '', b);
    expect(qidiruvNorm(t)).toContain('beton beton');
  });
  it('buzilgan fayl xato tashlamaydi; katta kirish rad; zip-bomba chegarasi (yozuv > 40 MB tashlab ketiladi)', () => {
    expect(matnAjrat('a.docx', '', enc('bu zip emas'))).toBe('');
    expect(matnAjrat('a.pdf', '', enc('%PDF-1.4 buzilgan'))).toBe('');
    expect(matnAjrat('a.txt', 'text/plain', { byteLength: MATN_MAX_KIRISH + 1 } as unknown as Uint8Array)).toBe('');
    const katta = zipSync({ 'word/document.xml': new Uint8Array(41 * 1024 * 1024).fill(65) });
    expect(matnAjrat('b.docx', '', katta)).toBe('');
  });
});

describe('parchaTop', () => {
  it('mos so‘z atrofidagi parcha; topilmasa boshidan; bo‘sh = null', () => {
    const m = 'Boshlanish. ' + 'x '.repeat(80) + 'Armatura A500C yetkazib berish. ' + 'y '.repeat(80);
    const p = parchaTop(m, ['armatura'])!;
    expect(p).toContain('Armatura A500C'); expect(p.startsWith('…')).toBe(true); expect(p.length).toBeLessThan(200);
    expect(parchaTop('Qisqa matn bor', ['yoq'])).toBe('Qisqa matn bor');
    expect(parchaTop('', ['a'])).toBeNull();
    expect(parchaTop('abc', [])).toBeNull();
  });
});
