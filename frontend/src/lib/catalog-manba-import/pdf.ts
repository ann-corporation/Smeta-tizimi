import { PDFParse } from 'pdf-parse';
import { mashinaSoatTahliliniCatalogga, tahlilMashinaSoatMatni } from './parse';
import type { CatalogTahlil } from './types';

/** PDF matnini brauzerda o‘qiydi; jadval aniqlanmasa importga tayyor deb qaytarmaydi. */
export async function tahlilMashinaSoatPdf(bytes: ArrayBuffer, fileName: string): Promise<CatalogTahlil> {
  const parser = new PDFParse({ data: bytes });
  try {
    const result = await parser.getText();
    const pages = result.pages.map(function (p) { return p.text; });
    return mashinaSoatTahliliniCatalogga(tahlilMashinaSoatMatni(fileName, result.text, pages));
  } finally {
    await parser.destroy();
  }
}
