/**
 * Texnadzor qaytargan F-2 xlsx'ni (1-varaq) FaylQator[] ga o'qish va solishtirish hisobotini Excelga yozish.
 * Ustunlar tizim eksportidagi bilan bir xil (f2-hujjat.ts USTUNLAR): 2 shifr, 3 nom, 6 hajm, 7 narx, 8 summa,
 * «Тип» va «КАЛИТ» sarlavhasi bo'yicha topiladi, izoh — КАЛИТ dan keyingi ustun.
 */
import type { FaylQator, Natija } from './f2-texnadzor-solishtir';

const matnQil = (v: unknown): string => {
  if (v == null) return '';
  if (typeof v === 'object') {
    const o = v as { richText?: Array<{ text?: string }>; result?: unknown; text?: unknown; hyperlink?: unknown };
    if (Array.isArray(o.richText)) return o.richText.map((x) => x.text ?? '').join('').trim();
    if ('result' in o) return matnQil(o.result);
    if (o.text != null) return matnQil(o.text);
    return '';
  }
  return String(v).trim();
};

export function sonQil(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v && typeof v === 'object' && 'result' in v) return sonQil((v as { result: unknown }).result);
  const s = matnQil(v).replace(/[\s ]/g, '').replace(',', '.');
  if (!s || !/^-?\d*\.?\d+(e[+-]?\d+)?$/i.test(s)) return null;
  return Number(s);
}

type Fill = { type?: string; pattern?: string; fgColor?: { argb?: string } } | undefined;
function rangOl(fill: Fill): string | null {
  const argb = fill?.type === 'pattern' && fill.pattern === 'solid' ? fill.fgColor?.argb : undefined;
  if (!argb || argb.length < 6) return null;
  const hex = argb.slice(-6).toUpperCase();
  return hex === 'FFFFFF' || hex === '000000' ? null : hex;
}

/** 1-varaqni o'qiydi. КАЛИТ sarlavhasi topilmasa — null (bu tizim eksporti emas). */
export async function texnadzorFaylOqi(bytes: ArrayBuffer | Uint8Array): Promise<FaylQator[] | null> {
  const ExcelJS = (await import('exceljs')).default; // og'ir kutubxona — faqat solishtirishda yuklanadi
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes instanceof Uint8Array ? (bytes as unknown as ArrayBuffer) : bytes);
  const ws = wb.worksheets[0];
  if (!ws) return null;
  let sarlavhaQator = 0; let kalitUstun = 0; let tipUstun = 9;
  for (let r = 1; r <= Math.min(15, ws.rowCount) && !kalitUstun; r++) {
    ws.getRow(r).eachCell((c, ci) => {
      const m = matnQil(c.value).toUpperCase();
      if (m === 'КАЛИТ') { kalitUstun = ci; sarlavhaQator = r; }
    });
  }
  if (!kalitUstun) return null;
  ws.getRow(sarlavhaQator).eachCell((c, ci) => { if (matnQil(c.value) === 'Тип') tipUstun = ci; });
  const natija: FaylQator[] = [];
  for (let r = sarlavhaQator + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const kalit = matnQil(row.getCell(kalitUstun).value) || null;
    natija.push({
      qator: r, shifr: matnQil(row.getCell(2).value), nom: matnQil(row.getCell(3).value),
      tip: matnQil(row.getCell(tipUstun).value).toLowerCase(),
      hajm: sonQil(row.getCell(6).value), narx: sonQil(row.getCell(7).value), summa: sonQil(row.getCell(8).value),
      kalit, izoh: matnQil(row.getCell(kalitUstun + 1).value),
      rang: rangOl(row.getCell(3).fill as Fill) ?? rangOl(row.getCell(6).fill as Fill) ?? rangOl(row.getCell(kalitUstun + 1).fill as Fill),
    });
  }
  return natija;
}

/** Solishtirish hisoboti (Excel) — ko'rinib turgan jadval ustunlari bilan bir xil. Matnlar t() orqali beriladi. */
export async function solishtirHisobotiXlsx(qatorlar: readonly Natija[], sarlavha: readonly string[], holatNomi: (n: Natija) => string): Promise<Uint8Array> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Texnadzor');
  ws.addRow([...sarlavha]).font = { bold: true };
  for (const n of qatorlar) ws.addRow([n.qator ?? '', n.shifr, n.nom, n.izoh, n.fHajm, n.dHajm, n.fNarx, n.dNarx, holatNomi(n)]);
  [8, 16, 60, 50, 12, 12, 14, 14, 18].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  return new Uint8Array(await wb.xlsx.writeBuffer());
}
