/**
 * Texnadzor qaytargan F-2 xlsx'ni AYNAN o'qish: har katak qiymati, fon rangi, shrift (rang/qalin/kursiv/chizilgan)
 * va Excel izohi (cell.note). Sof o'qish — hech narsa yozilmaydi. Solishtirish mantig'i f2-texnadzor-solishtir.ts da.
 */

export type AslKatak = {
  /** Ko'rsatiladigan matn. */
  v: string;
  /** Fon (RRGGBB) yoki null (oq/fonsiz). */
  fon: string | null;
  /** Shrift rangi (RRGGBB) yoki null (qora/standart). */
  rang: string | null;
  qalin: boolean;
  kursiv: boolean;
  chizilgan: boolean;
  /** Excel katak izohi (note) matni. */
  nota: string;
};

export type AslQator = {
  /** Excel qator raqami (1-asosli). */
  qator: number;
  /** 1..KALIT+1 ustunlar (KALIT ustuni ham o'z o'rnida, ko'rsatishda yashiriladi). */
  katak: AslKatak[];
  /** Standart bo'lmagan rang, izoh (note) yoki КАЛИТ dan keyingi ustun matni bor. */
  belgili: boolean;
};

export type AslHujjat = { sarlavhaQator: number; kalitUstun: number; sarlavha: AslQator[]; qatorlar: AslQator[] };

/** Office standart mavzusi (theme index -> RRGGBB). */
const MAVZU = ['FFFFFF', '000000', 'E7E6E6', '44546A', '4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47'];

type Rang = { argb?: string; theme?: number; tint?: number } | undefined;

const kanal = (c: number, tint: number) => Math.max(0, Math.min(255, Math.round(tint >= 0 ? c + (255 - c) * tint : c * (1 + tint))));

/** argb yoki mavzu(+tint) -> RRGGBB; aniqlab bo'lmasa null. */
export function rangHex(r: Rang): string | null {
  if (!r) return null;
  if (r.argb && r.argb.length >= 6) return r.argb.slice(-6).toUpperCase();
  if (typeof r.theme === 'number' && MAVZU[r.theme]) {
    const h = MAVZU[r.theme];
    const t = r.tint ?? 0;
    return [0, 2, 4].map((i) => kanal(parseInt(h.slice(i, i + 2), 16), t).toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  return null;
}

const standartFon = (h: string | null) => (h == null || h === 'FFFFFF' ? null : h);
const standartShrift = (h: string | null) => (h == null || h === '000000' ? null : h);

type NotaTuri = string | { texts?: Array<{ text?: string }> } | undefined | null;
export function notaMatn(n: NotaTuri): string {
  if (!n) return '';
  if (typeof n === 'string') return n.trim();
  return (n.texts ?? []).map((x) => x.text ?? '').join('').trim();
}

type XlCell = {
  value: unknown; text?: string; type?: number; note?: NotaTuri;
  fill?: { type?: string; pattern?: string; fgColor?: Rang };
  font?: { color?: Rang; bold?: boolean; italic?: boolean; strike?: boolean };
};

function katakOqi(c: XlCell): AslKatak {
  const f = c.fill;
  const fon = f?.type === 'pattern' && f.pattern === 'solid' ? standartFon(rangHex(f.fgColor)) : null;
  let v = '';
  try {
    if (typeof c.value === 'number') v = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 6 }).format(c.value);
    else if (c.value instanceof Date) v = c.value.toISOString().slice(0, 10);
    else v = (c.text ?? '').trim();
  } catch { v = ''; }
  return {
    v, fon, rang: standartShrift(rangHex(c.font?.color)),
    qalin: !!c.font?.bold, kursiv: !!c.font?.italic, chizilgan: !!c.font?.strike, nota: notaMatn(c.note),
  };
}

const belgiliMi = (k: AslKatak[], kalitUstun: number): boolean =>
  k.some((x, i) => x.fon != null || x.rang != null || x.chizilgan || x.nota !== '' || (i === kalitUstun && x.v !== ''));

/** 1-varaqni aynan o'qiydi. КАЛИТ sarlavhasi topilmasa — null (tizim eksporti emas). */
export async function texnadzorAslOqi(bytes: ArrayBuffer | Uint8Array): Promise<AslHujjat | null> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes instanceof Uint8Array ? (bytes as unknown as ArrayBuffer) : bytes);
  const ws = wb.worksheets[0];
  if (!ws) return null;
  let sarlavhaQator = 0; let kalitUstun = 0;
  for (let r = 1; r <= Math.min(15, ws.rowCount) && !kalitUstun; r++) {
    ws.getRow(r).eachCell((c, ci) => { if (String(c.text ?? '').trim().toUpperCase() === 'КАЛИТ') { kalitUstun = ci; sarlavhaQator = r; } });
  }
  if (!kalitUstun) return null;
  const oqiQator = (r: number): AslQator => {
    const row = ws.getRow(r);
    const katak: AslKatak[] = [];
    for (let ci = 1; ci <= kalitUstun + 1; ci++) katak.push(katakOqi(row.getCell(ci) as unknown as XlCell));
    return { qator: r, katak, belgili: belgiliMi(katak, kalitUstun) };
  };
  const sarlavha: AslQator[] = []; const qatorlar: AslQator[] = [];
  for (let r = 1; r <= sarlavhaQator; r++) sarlavha.push(oqiQator(r));
  for (let r = sarlavhaQator + 1; r <= ws.rowCount; r++) qatorlar.push(oqiQator(r));
  return { sarlavhaQator, kalitUstun, sarlavha, qatorlar };
}
