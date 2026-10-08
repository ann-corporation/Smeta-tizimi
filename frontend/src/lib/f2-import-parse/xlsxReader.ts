/**
 * Dependency-free .xlsx reader using only Web-standard APIs (ArrayBuffer,
 * DecompressionStream, TextDecoder, Blob/Response) — runs in a Cloudflare
 * Worker, a browser, or Node ≥18, with NO Node `fs`/`child_process` and no
 * npm package. This is the missing half of T2-GAS-EXIT-001 §4 ("F2 file
 * parsing must exit GAS"): `_f2lab/xlsx.js` (the GAS-side reference) does
 * the same job by shelling out to `powershell Expand-Archive`, which cannot
 * run in a Worker — this reads the ZIP's central directory and inflates
 * DEFLATE entries directly instead.
 *
 * The XML/sharedStrings parsing below (regex-based cell/row extraction) is
 * a direct, intentional port of `_f2lab/xlsx.js`'s own approach — that part
 * was already platform-agnostic (pure string regex), only the unzip
 * mechanism needed replacing.
 *
 * Verified 2026-09-04 against a real production F2 act (Amfiteatr, Февраль,
 * 526KB / 2998 rows, found via Google Drive) — see
 * `ops/handoff/T2_GAS_EXIT_001.md` §Remaining item 1 for how, and why the
 * real file itself is not committed to this (public) repo. The self-
 * contained test in `xlsxReader.test.ts` builds a minimal valid .xlsx byte-
 * for-byte in memory instead, so this module's own test suite needs no
 * external fixture.
 */
import type { SheetGrid, CellValue } from './types';

export interface XlsxSheet {
  name: string;
  rows: SheetGrid;
  merges: Array<{ r1: number; c1: number; r2: number; c2: number }>;
  /** Excelda yashirin varaq (state=hidden/veryHidden) — odatda eski qoralama. */
  hidden?: boolean;
  /** Source formula/outline evidence for the universal document reader. */
  formulalar?: Array<Array<string | null | undefined>>;
  outline?: Array<number | undefined>;
  /** OOXML numeric lexical values, before conversion to JS Number. */
  numericText?: Array<Array<string | null | undefined>>;
}
export interface XlsxWorkbook {
  sheets: XlsxSheet[];
  sheet(name: string): XlsxSheet | null;
}

/** OLE2/CFBF magic bytes -- every legacy binary `.xls` (Excel 97-2003, BIFF8)
 *  file starts with exactly this signature, regardless of extension. Real
 *  `.xlsx` is a ZIP and never starts with this. */
const OLE2_SIG = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

function isLegacyOle2(buf: Uint8Array): boolean {
  if (buf.length < OLE2_SIG.length) return false;
  for (let i = 0; i < OLE2_SIG.length; i++) if (buf[i] !== OLE2_SIG[i]) return false;
  return true;
}

/**
 * Owner (2026-09-07): "eski shakldagi exellni ocholmas ekan tizim ... hamma
 * joyda ham bunaqa versiyaga bog'liq holda masala qilmasin, universal
 * bo'lsin" -- old-format (.xls, Excel 97-2003 BIFF8) files must open
 * everywhere this reads a spreadsheet, not per-page. Fixed ONCE here (the
 * one function every upload path calls) rather than in each caller.
 *
 * BIFF8 is a completely different binary format from OOXML (an OLE2
 * compound-file container, not a ZIP) -- there is no reasonable
 * dependency-free way to parse it (unlike the ZIP+XML `.xlsx` path above,
 * which is simple enough to hand-roll). SheetJS is the standard, battle-
 * tested reader for it; loaded via dynamic import so the ~800KB parser
 * only ever downloads for someone who actually uploads a legacy file --
 * every current real upload path is a real `.xlsx`, so this changes
 * nothing for the common case.
 */
async function readWithSheetJs(buf: Uint8Array): Promise<XlsxWorkbook> {
  let XLSX: typeof import('xlsx');
  try {
    XLSX = await import('xlsx');
  } catch {
    throw new Error('XLS_SPREADSHEET_READER_UNAVAILABLE: jadval formatini o‘qish kutubxonasi yuklanmadi.');
  }
  const wb = XLSX.read(buf, { type: 'array', cellDates: false, cellFormula: true, cellStyles: true });
  const sheets: XlsxSheet[] = wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const sourceRange = ws['!ref'] ? { s: { r: 0, c: 0 }, e: XLSX.utils.decode_range(ws['!ref']).e } : 0;
    const rows = (XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, range: sourceRange, blankrows: true }) as unknown[][])
      .map((row) => row.map((cell): CellValue => {
        if (cell == null) return null;
        if (typeof cell === 'string' || typeof cell === 'number') return cell;
        return String(cell);
      }));
    const merges: XlsxSheet['merges'] = (ws['!merges'] || []).map((m) => ({
      r1: m.s.r, c1: m.s.c, r2: m.e.r, c2: m.e.c,
    }));
    const hidden = !!wb.Workbook?.Sheets?.find((s) => s.name === name)?.Hidden;
    const formulalar: XlsxSheet['formulalar'] = [];
    for (const [address, cell] of Object.entries(ws)) {
      if (address.startsWith('!') || !(cell as import('xlsx').CellObject).f) continue;
      const { r, c } = XLSX.utils.decode_cell(address);
      (formulalar[r] ??= [])[c] = (cell as import('xlsx').CellObject).f;
    }
    const outline = (ws['!rows'] ?? []).map((row) => row?.level);
    return { name, rows, merges, formulalar, outline, ...(hidden ? { hidden } : {}) };
  });
  return { sheets, sheet: (name: string) => sheets.find((s) => s.name === name) ?? null };
}

async function readLegacyXls(buf: Uint8Array): Promise<XlsxWorkbook> {
  try {
    return await readWithSheetJs(buf);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('XLS_SPREADSHEET_READER_UNAVAILABLE')) {
      throw new Error('XLS_LEGACY_READER_UNAVAILABLE: eski (.xls) formatni o‘qish kutubxonasi yuklanmadi.');
    }
    throw error;
  }
}

const EOCD_SIG = 0x06054b50;
const CENTRAL_DIR_SIG = 0x02014b50;
const LOCAL_HEADER_SIG = 0x04034b50;

function u16(v: DataView, off: number): number { return v.getUint16(off, true); }
function u32(v: DataView, off: number): number { return v.getUint32(off, true); }

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  /* `Blob.stream()` Chrome va Workersda bor, lekin Vitest/jsdom kabi haqiqiy
     browser bo'lmagan muhitlarda Blob yarim-implementatsiya bo'lishi mumkin.
     `Response(Uint8Array).body` esa browser, Worker va Node 18+da bir xil
     Web Streams kontraktini beradi. Shu yo'l siqilgan Excel faylini hamma
     import yo'llarida bir xil o'qiydi; faqat testni emas, parserning o'zini
     portativ qiladi. */
  // `bytes` TypedArray'i SharedArrayBuffer ko'rinishida ham kelishi mumkin;
  // Response uchun esa mutlaqo oddiy, mustaqil ArrayBuffer beramiz.
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const source = new Response(copy.buffer).body;
  if (!source) throw new Error('XLSX_STREAM_UNAVAILABLE: compressed XLSX oqimi ochilmadi');
  const stream = source.pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

interface ZipEntry { method: number; compSize: number; localHeaderOffset: number }

/** Reads a ZIP's central directory and inflates each requested/available entry. Throws on a non-ZIP or malformed file — never silently returns partial/wrong data. */
async function unzip(buf: Uint8Array): Promise<Record<string, Uint8Array>> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  // EOCD sits at the end, optionally after a variable-length comment (max 65535 bytes) — scan backward.
  const scanFrom = Math.max(0, buf.length - 22 - 65557);
  for (let i = buf.length - 22; i >= scanFrom; i--) {
    if (u32(dv, i) === EOCD_SIG) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('XLSX_NOT_A_ZIP: End-of-central-directory record not found');

  const cdOffset = u32(dv, eocd + 16);
  const cdCount = u16(dv, eocd + 10);
  const entries: Record<string, ZipEntry> = {};
  let p = cdOffset;
  for (let i = 0; i < cdCount; i++) {
    if (u32(dv, p) !== CENTRAL_DIR_SIG) throw new Error('XLSX_BAD_CENTRAL_DIRECTORY at offset ' + p);
    const method = u16(dv, p + 10);
    const compSize = u32(dv, p + 20);
    const nameLen = u16(dv, p + 28);
    const extraLen = u16(dv, p + 30);
    const commentLen = u16(dv, p + 32);
    const localHeaderOffset = u32(dv, p + 42);
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nameLen));
    entries[name] = { method, compSize, localHeaderOffset };
    p += 46 + nameLen + extraLen + commentLen;
  }

  const files: Record<string, Uint8Array> = {};
  for (const name in entries) {
    const e = entries[name];
    const lp = e.localHeaderOffset;
    if (u32(dv, lp) !== LOCAL_HEADER_SIG) throw new Error('XLSX_BAD_LOCAL_HEADER for ' + name);
    const lNameLen = u16(dv, lp + 26);
    const lExtraLen = u16(dv, lp + 28);
    const dataStart = lp + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(dataStart, dataStart + e.compSize);
    if (e.method === 0) files[name] = raw;
    else if (e.method === 8) files[name] = await inflateRaw(raw);
    else throw new Error('XLSX_UNSUPPORTED_COMPRESSION method=' + e.method + ' for ' + name);
  }
  return files;
}

/** Ported verbatim (behavior) from `_f2lab/xlsx.js`'s `dec()`. */
function decodeXmlEntities(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(+d))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, d) => String.fromCharCode(parseInt(d, 16)))
    .replace(/&amp;/g, '&');
}

function parseSharedStrings(xml: string | undefined): string[] {
  if (!xml) return [];
  const out: string[] = [];
  for (const m of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    let t = '';
    for (const tm of m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) t += tm[1];
    out.push(decodeXmlEntities(t));
  }
  return out;
}

function colIdx(ref: string): number {
  let c = 0;
  for (const ch of ref) { if (ch >= 'A' && ch <= 'Z') c = c * 26 + (ch.charCodeAt(0) - 64); else break; }
  return c - 1;
}

function parseSheetXml(xml: string, sharedStrings: string[]): Pick<XlsxSheet, 'rows' | 'merges' | 'formulalar' | 'outline' | 'numericText'> {
  const rows: SheetGrid = [];
  const formulalar: NonNullable<XlsxSheet['formulalar']> = [];
  const outline: NonNullable<XlsxSheet['outline']> = [];
  const numericText: NonNullable<XlsxSheet['numericText']> = [];
  for (const rm of xml.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const rIdx = +rm[1] - 1;
    const level = rm[0].slice(0, rm[0].indexOf('>')).match(/outlineLevel="(\d+)"/);
    if (level) outline[rIdx] = Number(level[1]);
    const arr: CellValue[] = [];
    for (const cm of rm[2].matchAll(/<c\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1];
      const body = cm[2] || '';
      const refM = attrs.match(/r="([A-Z]+)\d+"/);
      if (!refM) continue;
      const t = (attrs.match(/t="(\w+)"/) || [])[1] || '';
      const cIdx = colIdx(refM[1]);
      const fm = body.match(/<f(?:\s[^>]*)?>([\s\S]*?)<\/f>/);
      if (fm) (formulalar[rIdx] ??= [])[cIdx] = decodeXmlEntities(fm[1]);
      else if (/<f(?:\s[^>]*)?\s*\/>/.test(body)) (formulalar[rIdx] ??= [])[cIdx] = '#SHARED_FORMULA_UNRESOLVED!';
      let v: CellValue = '';
      const vm = body.match(/<v>([\s\S]*?)<\/v>/);
      if (vm) v = decodeXmlEntities(vm[1]);
      else { const im = body.match(/<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/); if (im) v = decodeXmlEntities(im[1]); }
      if (vm && (t === '' || t === 'n')) (numericText[rIdx] ??= [])[cIdx] = decodeXmlEntities(vm[1]);
      if (t === 's') v = sharedStrings[Number(v)] ?? '';
      else if (t !== 'str' && t !== 'inlineStr' && v !== '' && !isNaN(Number(v))) v = Number(v);
      arr[colIdx(refM[1])] = v;
    }
    /* XMLda faqat A va F katagi yozilgan bo'lsa, JavaScript massivi A…F
       oralig'ida "teshik"lar bilan chiqadi. Bu tashqi hujjat formati
       xususiyati, biznes ma'lumoti emas. Ularni bir marta shu parser
       chegarasida aniq `null`ga aylantiramiz: keyingi LRV/RES/F2 detektori,
       renderer va eksportchi hech qachon `undefined` katak bilan ishlamaydi. */
    rows[rIdx] = Array.from({ length: arr.length }, (_, col) => arr[col] ?? null);
  }
  for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];

  const merges: XlsxSheet['merges'] = [];
  for (const m of xml.matchAll(/<mergeCell ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"/g)) {
    merges.push({ r1: +m[2] - 1, c1: colIdx(m[1]), r2: +m[4] - 1, c2: colIdx(m[3]) });
  }
  return { rows, merges, formulalar, outline, numericText };
}

function parseWorkbookSheetList(xml: string, relsXml: string | undefined): Array<{ name: string; target: string; hidden: boolean }> {
  const relMap: Record<string, string> = {};
  if (relsXml) {
    for (const m of relsXml.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/>/g)) relMap[m[1]] = m[2];
  }
  const out: Array<{ name: string; target: string; hidden: boolean }> = [];
  for (const m of xml.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"[^>]*\/>/g)) {
    const target = (relMap[m[2]] || '').replace(/^\/?xl\//, '');
    out.push({ name: decodeXmlEntities(m[1]), target, hidden: /\bstate="(?:hidden|veryHidden)"/.test(m[0]) });
  }
  return out;
}

function hasMeaningfulCells(rows: SheetGrid): boolean {
  return rows.some((row) => row.some((cell) => cell != null && String(cell).trim() !== ''));
}

/** Reads an .xlsx (or .xlsm) file's every non-hidden-by-name sheet into `{name, rows, merges}`. Hidden-sheet filtering (as GAS's `apiF2Varaqlar` does) is the CALLER's job — this returns everything found in the workbook. */
export async function readXlsx(bytes: ArrayBuffer | Uint8Array): Promise<XlsxWorkbook> {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (isLegacyOle2(buf)) return readLegacyXls(buf);
  let files: Record<string, Uint8Array>;
  try {
    files = await unzip(buf);
  } catch (error) {
    const looksLikeZip = buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
    if (!looksLikeZip) throw error;
    // Web unzipper browser/Worker uchun asosiy yo‘l. Lekin Node test muhiti,
    // eski Chromium yoki ayrim Excel eksportlari Blob.stream/DEFLATE
    // imkoniyatini bermasligi mumkin. Bunday holatda importni “Cannot read …”
    // bilan sindirmay, mavjud SheetJS fallback orqali ayni jadvalni o‘qiymiz.
    // Noto‘g‘ri fayl bo‘lsa fallback ham yiqiladi va asl parser xatosi qaytadi.
    try {
      return await readWithSheetJs(buf);
    } catch {
      throw error;
    }
  }
  const dec = new TextDecoder('utf-8');

  const workbookXml = files['xl/workbook.xml'] ? dec.decode(files['xl/workbook.xml']) : null;
  if (!workbookXml) throw new Error('XLSX_NO_WORKBOOK: xl/workbook.xml missing — not a valid .xlsx');
  const relsXml = files['xl/_rels/workbook.xml.rels'] ? dec.decode(files['xl/_rels/workbook.xml.rels']) : undefined;
  const sharedStrings = parseSharedStrings(files['xl/sharedStrings.xml'] ? dec.decode(files['xl/sharedStrings.xml']) : undefined);

  const sheetList = parseWorkbookSheetList(workbookXml, relsXml);
  const sheets: XlsxSheet[] = sheetList.map(({ name, target, hidden }) => {
    const path = 'xl/' + target;
    const xml = files[path] ? dec.decode(files[path]) : null;
    const parsed = xml ? parseSheetXml(xml, sharedStrings) : { rows: [] as SheetGrid, merges: [] };
    return { name, ...parsed, ...(hidden ? { hidden } : {}) };
  });

  // Ayrim Excel/ABC/TN fayllarida varaq XML'i to'g'ri ochiladi, lekin
  // dependency-free regex o'quvchi ayrim hujayra shakllarini o'tkazib yuborib,
  // butun bir varaqni bo'sh deb qaytarishi mumkin. Bunday holatda foydalanuvchi
  // ko'rgan RES varag'i “topilmadi” bo'lib qolmasin: SheetJS bilan bir marta
  // to'liq fallback qilamiz. Haqiqatan bo'sh, faqat format saqlaydigan varaqlar
  // fallbackni majburlamaydi.
  const incompleteSheet = sheetList.some(({ target }, index) => {
    const xml = files['xl/' + target] ? dec.decode(files['xl/' + target]) : '';
    const hasCellMarkup = /<row\b[\s\S]*?<c\b/.test(xml);
    return hasCellMarkup && !hasMeaningfulCells(sheets[index]?.rows ?? []);
  });
  if (incompleteSheet) {
    try {
      return await readWithSheetJs(buf);
    } catch {
      // SheetJS optional bo'lib qoladi; dependency mavjud bo'lmagan Worker
      // buildlarida custom natijani yo'qotmaymiz.
    }
  }

  return { sheets, sheet: (name: string) => sheets.find((s) => s.name === name) ?? null };
}
