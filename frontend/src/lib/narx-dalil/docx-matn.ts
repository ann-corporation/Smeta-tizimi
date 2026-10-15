/**
 * Word (.docx) hujjatidan matn: paragraflar qator bo'yicha, jadval kataklari " | " bilan (KP va prays-listlar odatda
 * jadvalda). Faqat o'qish — formatlash va rasm olinmaydi. Eski .doc (ikkilik) qo'llab-quvvatlanmaydi.
 */
import { strFromU8, unzipSync } from 'fflate';

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
export function docxXmlMatn(xml: string): string {
  return xml
    // A table cell may hold several paragraphs: inside a cell they are joined by a space, so one row stays one line.
    .replace(/<w:tc\b[\s\S]*?<\/w:tc>/g, c => c.replace(/<\/w:p>/g, ' '))
    .replace(/<w:tab\/>/g, ' ')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<\/w:tc>/g, ' | ')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<\/w:tr>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|apos);/g, (_, e: string) => ENT[e])
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/[ \t]+/g, ' ')
    .replace(/(\s*\|\s*)+\n/g, '\n')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

export function docxMatni(bytes: Uint8Array): string {
  const files = unzipSync(bytes, { filter: f => f.name === 'word/document.xml' });
  const xml = files['word/document.xml'];
  if (!xml) throw new Error('DOCX_INVALID');
  return docxXmlMatn(strFromU8(xml));
}
