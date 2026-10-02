import type { XlsxSheet } from '../f2-import-parse/xlsxReader';
import type {
  CatalogDavr, CatalogManbaTuri, CatalogNarxVarianti, CatalogQator,
  CatalogTahlil, CatalogUstun, CatalogValyuta, CatalogVaraqRoli,
  CatalogVaraqTahlili, MashinaSoatMatnTahlili, MashinaSoatMatnQatori,
  CatalogWorkbookLike,
} from './types';

const DASH = /^[-–—.]+$/;
const CLEAN = (v: unknown) => String(v ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
const LOWER = (v: unknown) => CLEAN(v).toLocaleLowerCase('ru-RU');

function norm(v: unknown) {
  return LOWER(v).replace(/["'«»()]/g, '').replace(/[^\p{L}\p{N}]+/gu, '');
}

function numberOrNull(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = CLEAN(v);
  if (!s || DASH.test(s)) return null;
  let x = s.replace(/\s/g, '').replace(/₽|сум|сўм/gi, '');
  const comma = x.lastIndexOf(',');
  const dot = x.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) {
    const decimal = Math.max(comma, dot);
    const after = x.length - decimal - 1;
    if (after <= 2) {
      const intPart = x.slice(0, decimal).replace(/[,.]/g, '');
      const frac = x.slice(decimal + 1).replace(/[^0-9]/g, '');
      x = `${intPart}.${frac}`;
    } else x = x.replace(/[,.]/g, '');
  } else if (comma >= 0) {
    const after = x.length - comma - 1;
    x = after <= 2 ? `${x.slice(0, comma).replace(/,/g, '')}.${x.slice(comma + 1)}` : x.replace(/,/g, '');
  } else if (dot >= 0) {
    const after = x.length - dot - 1;
    x = after <= 2 ? x : x.replace(/\./g, '');
  }
  const n = Number(x.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function yearQuarter(text: string): { yil: number | null; kvartal: 1 | 2 | 3 | 4 | null } {
  const t = text.replace(/\s+/g, ' ');
  const y = t.match(/(?:19|20)\d{2}/)?.[0];
  const q = t.match(/(?:^|[^0-9])([1-4])\s*[- ]?\s*(?:кв|квартал|кварт|quarter|чверть)/i)?.[1]
    ?? t.match(/(?:кв|квартал|quarter|чверть)\s*([1-4])/i)?.[1];
  return { yil: y ? Number(y) : null, kvartal: q ? Number(q) as 1 | 2 | 3 | 4 : null };
}

function dateLabel(text: string) {
  const m = text.match(/(?:^|\s)(\d{1,2})[./](\d{1,2})[./](20\d{2})(?:\s|$)/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}

function davrAniqla(fileName: string, text: string): CatalogDavr {
  const fromText = yearQuarter(text);
  const fromFile = yearQuarter(fileName);
  const hit = fromText.yil && fromText.kvartal ? fromText : fromFile;
  return {
    yil: hit.yil,
    kvartal: hit.kvartal,
    yorliq: hit.yil && hit.kvartal ? `${hit.yil}-Q${hit.kvartal}` : (hit.yil ? String(hit.yil) : 'Davr aniqlanmadi'),
    ishonch: hit.yil && hit.kvartal ? 'yuqori' : hit.yil ? 'o_rta' : 'past',
  };
}

function isPriceText(v: unknown) { return numberOrNull(v) !== null; }

/** Katalog narxi: bo'sh, "-" va 0 — e'lon qilinmagan (NULL). Manfiy narx ham yaroqsiz. */
function narxOqi(v: unknown): number | null {
  const n = numberOrNull(v);
  return n === null || n <= 0 ? null : n;
}

/** "1 | 2 | 3 | 4 …" — ustunlarni raqamlash qatori. */
function raqamlashQatori(row: unknown[]): boolean {
  const vals = row.map(CLEAN).filter(Boolean);
  return vals.length >= 3 && vals.every((v) => /^\d{1,2}$/.test(v));
}

/** Birlashtirilgan katak (guruh nomi) — bir xil matn 3+ katakda takrorlanadi. */
function guruhQatori(row: unknown[]): string | null {
  const vals = row.map(CLEAN).filter(Boolean);
  if (vals.length < 2) return null;
  const top = vals.reduce<Record<string, number>>((a, v) => { a[v] = (a[v] ?? 0) + 1; return a; }, {});
  const [matn, soni] = Object.entries(top).sort((a, b) => b[1] - a[1])[0];
  return soni >= Math.max(2, Math.ceil(vals.length * 0.6)) && !/^\d+([.,]\d+)?$/.test(matn) ? matn : null;
}

/**
 * Sarlavha bloki: asosiy sarlavha qatoridan keyin НДС / sana / yil / raqamlash qatorlari bo'lishi
 * mumkin (real katalog: 3 qatorli sarlavha). Har narx ustuniga butun blok matni yig'iladi;
 * ma'lumot birinchi "haqiqiy" qatordan boshlanadi.
 */
function sarlavhaBloki(sheet: XlsxSheet, headerRow: number, nameCol: number): { boshi: number; ustunMatni: (c: number) => string } {
  const headName = CLEAN(sheet.rows[headerRow]?.[nameCol]);
  let r = headerRow + 1;
  const blok: number[] = [headerRow];
  for (; r < Math.min(sheet.rows.length, headerRow + 8); r++) {
    const row = sheet.rows[r] || [];
    const nm = CLEAN(row[nameCol]);
    const bosh = row.every((v) => !CLEAN(v));
    if (bosh || raqamlashQatori(row)) { blok.push(r); continue; }
    if (nm && nm === headName) { blok.push(r); continue; }
    // Nom ustuni bo'sh, lekin boshqa kataklarda НДС/sana/yil yozuvi — sarlavha davomi.
    if (!nm && row.some((v) => /ндс|\d{1,2}[./]\d{1,2}[./]20\d{2}|20\d{2}\s*(г|год)|цена|стоимость/i.test(CLEAN(v)))) { blok.push(r); continue; }
    if (/^(механизмы|материалы|наименование)$/i.test(nm) && !row.some((v, i) => i !== nameCol && narxOqi(v) !== null && /^[\d\s.,]+$/.test(CLEAN(v)) && Number(CLEAN(v).replace(/\s/g, '').replace(',', '.')) > 31)) { blok.push(r); continue; }
    break;
  }
  return { boshi: r, ustunMatni: (c: number) => blok.map((i) => CLEAN(sheet.rows[i]?.[c])).filter(Boolean).join(' | ') };
}

function ustunSanasi(matn: string): string | null {
  const d = dateLabel(` ${matn.replace(/\|/g, ' ')} `);
  if (d) return d;
  const y = matn.match(/(?:на\s*)?((?:19|20)\d{2})\s*(?:г|год)/i)?.[1];
  return y ?? null;
}

function sheetText(sheet: XlsxSheet, maxRows = 35, maxCols = 24) {
  return sheet.rows.slice(0, maxRows).map(row => row.slice(0, maxCols).map(CLEAN).join(' | ')).join(' | ');
}

function rowText(row: unknown[]) { return row.map(CLEAN).join(' | '); }

function isNameHeader(v: unknown) {
  const s = norm(v);
  return s.includes('наименование') || s.includes('продукц') || s.includes('ресурс') || s.includes('наименованиересурса');
}

function isUnitHeader(v: unknown) {
  const s = norm(v);
  if (s.includes('цена') || s.includes('стоимост')) return false;
  return s.includes('едизм') || s.includes('единица') || s === 'ед' || s.includes('измер');
}

function variantOf(header: string, parent: string): CatalogNarxVarianti {
  const own = LOWER(header);
  if (own.includes('без ндс') || own.includes('безндс')) return 'nds_siz';
  if (own.includes('с ндс') || own.includes('сндс')) return 'nds_bilan';
  const s = LOWER(parent);
  if (s.includes('без ндс') || s.includes('безндс')) return 'nds_siz';
  if (s.includes('с ндс') || s.includes('сндс')) return 'nds_bilan';
  return 'noma_lum';
}

function currencyOf(text: string): CatalogValyuta {
  return LOWER(text).includes('доллар') || LOWER(text).includes('usd') ? 'USD' : LOWER(text).includes('сум') || LOWER(text).includes('uzs') ? 'UZS' : 'noma_lum';
}

function findHeader(sheet: XlsxSheet, salary: boolean) {
  const limit = Math.min(40, sheet.rows.length);
  for (let r = 0; r < limit; r++) {
    const text = rowText(sheet.rows[r] || []);
    const hasRegion = /регион|регионы|hudud/i.test(text);
    const hasName = (sheet.rows[r] || []).some(isNameHeader);
    const hasUnit = (sheet.rows[r] || []).some(isUnitHeader);
    const hasSalary = /соц\.?\s*страх|заработн|иш\s*хаки/i.test(text);
    const hasRegionCell = (sheet.rows[r] || []).some(cell => /^регионы?$|^hududlar?$/i.test(CLEAN(cell)));
    const hasPrice = /цена|стоимость/i.test(text);
    if (salary ? hasRegion && hasSalary && hasRegionCell : hasName && (hasUnit || hasPrice)) return r;
  }
  return null;
}

function detectSalary(sheet: XlsxSheet) {
  const t = sheetText(sheet, 10, 14);
  return /заработн|иш\s*хаки|соц\.?\s*страх/i.test(t) && /регион|регионы|hudud/i.test(t);
}

function detectMaterial(sheet: XlsxSheet) {
  const t = sheetText(sheet, 18, 24);
  return /наименование|продукц|отпускн|цена/i.test(t) && (t.includes('ед') || t.includes('изм'));
}

function detectRole(sheet: XlsxSheet): CatalogVaraqRoli {
  if (sheet.hidden) return 'qopqoq';
  if (detectSalary(sheet)) return 'ish_haqi_jadvali';
  const t = LOWER(sheetText(sheet, 18, 20));
  if (/маш\.?\s*час|маш[- ]?ч\b|машино-?час/.test(t) && /цена|стоимость/.test(t)) return 'mashina_soat_jadvali';
  if (detectMaterial(sheet)) return 'narx_jadvali';
  if (/транспорт|машин|механизм|мех\.?час/.test(t) && /цена|стоимость/.test(t)) return 'mashina_soat_jadvali';
  return 'noma_lum';
}

function headerColumns(sheet: XlsxSheet, headerRow: number, salary: boolean): { name: number; unit: number | null; region: number | null; prices: CatalogUstun[] } {
  const row = sheet.rows[headerRow] || [];
  let name = -1; let unit: number | null = null; let region: number | null = null;
  const prices: CatalogUstun[] = [];
  row.forEach((cell, c) => {
    const s = LOWER(cell);
    if (name < 0 && (salary ? /наименование|наимен|работ|вид/.test(s) : isNameHeader(cell))) name = c;
    if (unit === null && isUnitHeader(cell)) unit = c;
    if (region === null && /регион|регионы|hudud/.test(s)) region = c;
    if (/цена|стоимость|зарплат|202\d|страх|соц/.test(s) || (typeof cell === 'number' && c > 1)) {
      const context = sheet.rows.slice(headerRow, headerRow + 4).map(r => CLEAN(r[c])).join(' | ');
      const v = salary ? (s.includes('12') ? 'ijtimoiy_12' : s.includes('25') ? 'ijtimoiy_25' : 'asosiy') : variantOf(String(cell), context);
      prices.push({ indeks: c, sarlavha: CLEAN(cell), varianti: v as CatalogNarxVarianti, sanasi: dateLabel(CLEAN(cell)) });
    }
  });
  if (name < 0) name = salary ? 1 : Math.min(1, row.length - 1);
  if (!prices.length && row.length > name + 1) {
    for (let c = name + 1; c < row.length; c++) prices.push({ indeks: c, sarlavha: '', varianti: salary ? 'asosiy' : 'noma_lum', sanasi: null });
  }
  return { name, unit, region, prices: prices.filter((p, i, a) => a.findIndex(x => x.indeks === p.indeks) === i) };
}

function sourceKey(fileName: string, sheet: string, row: number, name: string, unit: string | null, variant: string, date: string | null) {
  // Row is a source locator only. The stable key includes the normalized identity and price variant.
  return [fileName.toLocaleLowerCase(), sheet.toLocaleLowerCase(), norm(name), norm(unit), variant, date || ''].join('|');
}

function parseSalarySheet(sheet: XlsxSheet, fileName: string, davr: CatalogDavr, analysis: CatalogVaraqTahlili): CatalogQator[] {
  const header = analysis.sarlavhaQatori ?? 0;
  const cols = headerColumns(sheet, header, true);
  const out: CatalogQator[] = [];
  for (let r = (analysis.ma_lumotBoshi ?? header + 1); r < sheet.rows.length; r++) {
    const cells = sheet.rows[r] || [];
    const region = CLEAN(cols.region === null ? cells[1] : cells[cols.region]);
    if (!region || /итого|жами|республика узбекистан/i.test(region) && !isPriceText(cells[2])) continue;
    const name = region;
    for (const col of cols.prices) {
      const price = narxOqi(cells[col.indeks]);
      const variant = col.varianti === 'noma_lum' ? 'asosiy' : col.varianti;
      const warnings = price === null ? ['PRICE_MISSING: manbada qiymat ko‘rsatilmagan'] : [];
      out.push({ sourceKey: sourceKey(fileName, sheet.name, r + 1, name, 'ЧЕЛ.-Ч', variant, col.sanasi), varaqqa: sheet.name, manbaQatori: r + 1, nom: name, birlik: 'ЧЕЛ.-Ч', kod: null, hudud: region, narx: price, narxVarianti: variant, valyuta: 'UZS', davr, izoh: JSON.stringify({ manba: 'ish_haqi', hudud: region, variant, ustun: col.sarlavha || null }), ogohlantirishlar: warnings });
    }
  }
  return out;
}

function parseMaterialSheet(sheet: XlsxSheet, fileName: string, davr: CatalogDavr, analysis: CatalogVaraqTahlili): CatalogQator[] {
  const header = analysis.sarlavhaQatori ?? 0;
  const mashina = analysis.rol === 'mashina_soat_jadvali';
  const cols = headerColumns(sheet, header, false);
  const blok = sarlavhaBloki(sheet, header, cols.name);
  // Har narx ustuni — butun sarlavha blokidan: НДС holati va sana/yil (real katalog: 01.08/01.09/01.10).
  const narxUstunlari = cols.prices.map((col) => {
    const matn = blok.ustunMatni(col.indeks);
    const v = variantOf(matn, matn);
    return { ...col, varianti: v === 'noma_lum' ? (mashina ? 'asosiy' as const : 'noma_lum' as const) : v, sanasi: ustunSanasi(matn) ?? col.sanasi, sarlavha: matn || col.sarlavha };
  });
  analysis.ustunlar = narxUstunlari;
  analysis.ma_lumotBoshi = blok.boshi;
  const out: CatalogQator[] = [];
  const fullHeaderText = sheetText(sheet, Math.min(sheet.rows.length, blok.boshi + 1), 30);
  const valyuta = currencyOf(`${sheet.name} ${fullHeaderText}`) === 'noma_lum' && mashina ? 'UZS' : currencyOf(`${sheet.name} ${fullHeaderText}`);
  const hudud = analysis.hudud;
  const headName = CLEAN(sheet.rows[header]?.[cols.name]);
  let guruh: string | null = null;
  for (let r = blok.boshi; r < sheet.rows.length; r++) {
    const cells = sheet.rows[r] || [];
    if (raqamlashQatori(cells)) continue;
    const g = guruhQatori(cells);
    if (g) { guruh = g; continue; }
    const name = CLEAN(cells[cols.name]);
    if (!name || name === headName || /^примечани|^итого|^всего|^jami/i.test(name)) continue;
    const unitRaw = cols.unit === null ? null : CLEAN(cells[cols.unit]) || null;
    const unit = unitRaw ?? (mashina ? 'МАШ.-Ч' : null);
    if (!unit || unit.length > 24) continue;          // birlik o'rnida izoh — mahsulot emas
    const code = CLEAN(cells[0]) || null;
    const narxlar = narxUstunlari.map((col) => narxOqi(cells[col.indeks]));
    const hechNarx = narxlar.every((n) => n === null);
    if (hechNarx && !narxUstunlari.length) continue;
    for (let ci = 0; ci < narxUstunlari.length; ci++) {
      const col = narxUstunlari[ci];
      const price = narxlar[ci];
      // "-" / bo'sh / 0 — shu ustunda e'lon qilinmagan; faqat HECH narxi yo'q mahsulot uchun bitta NULL qator.
      if (price === null && !(hechNarx && ci === 0)) continue;
      const variant = col.varianti;
      out.push({ sourceKey: sourceKey(fileName, sheet.name, r + 1, name, unit, variant, col.sanasi), varaqqa: sheet.name, manbaQatori: r + 1, nom: name, birlik: unit, kod: code && /^\d+$/.test(code) ? null : code, hudud: mashina ? null : hudud, narx: price, narxVarianti: variant, valyuta, davr, izoh: JSON.stringify({ manba: mashina ? 'mashina_soat' : 'katalog', hudud: mashina ? null : hudud, guruh, valyuta, variant, ustun: col.sarlavha || null, sana: col.sanasi }), ogohlantirishlar: price === null ? ['PRICE_MISSING: manbada narx e‘lon qilinmagan'] : [] });
    }
  }
  return out;
}

export function tahlilKatalogXlsx(workbook: CatalogWorkbookLike, fileName: string): CatalogTahlil {
  const davr = davrAniqla(fileName, '');
  const fileHit = yearQuarter(fileName);
  const varaqlar: CatalogVaraqTahlili[] = [];
  const qatorlar: CatalogQator[] = [];
  const periodNizolari: string[] = [];
  for (const sheet of workbook.sheets) {
    const rol = detectRole(sheet);
    const salary = rol === 'ish_haqi_jadvali';
    const header = salary ? findHeader(sheet, true) : rol === 'narx_jadvali' || rol === 'mashina_soat_jadvali' ? findHeader(sheet, false) : null;
    const source = sheetText(sheet, Math.min(sheet.rows.length, 10), 14);
    const sheetDavr = davrAniqla(fileName, `${sheet.name} ${source}`);
    const roleWarnings: string[] = [];
    if (fileHit.yil && fileHit.kvartal && sheetDavr.yil && sheetDavr.kvartal && (fileHit.yil !== sheetDavr.yil || fileHit.kvartal !== sheetDavr.kvartal)) {
      const conflict = `PERIOD_CONFLICT: fayl nomi ${fileHit.yil}-Q${fileHit.kvartal}, varaq ${sheet.name} esa ${sheetDavr.yil}-Q${sheetDavr.kvartal}`;
      roleWarnings.push(conflict);
      periodNizolari.push(`${sheet.name}: ${conflict}`);
    }
    if (rol === 'noma_lum' && sheet.rows.length > 0) roleWarnings.push('SHEET_UNRESOLVED: varaq katalog sifatida tasdiqlanmadi');
    if (header === null && (rol === 'narx_jadvali' || rol === 'ish_haqi_jadvali' || rol === 'mashina_soat_jadvali')) roleWarnings.push('HEADER_UNRESOLVED: sarlavha qatori aniqlanmadi');
    const cols = header === null ? { name: 0, unit: null, region: null, prices: [] as CatalogUstun[] } : headerColumns(sheet, header, salary);
    const analysis: CatalogVaraqTahlili = { nom: sheet.name, rol, sarlavhaQatori: header, ma_lumotBoshi: header === null ? null : header + 1, hudud: CLEAN(sheet.name).replace(/,.*$/, '') || null, ustunlar: cols.prices, qatorSoni: 0, narxliQatorSoni: 0, warnings: roleWarnings };
    let rows: CatalogQator[] = [];
    if (header !== null && salary) rows = parseSalarySheet(sheet, fileName, sheetDavr, analysis);
    else if (header !== null && (rol === 'narx_jadvali' || rol === 'mashina_soat_jadvali')) rows = parseMaterialSheet(sheet, fileName, sheetDavr, analysis);
    analysis.qatorSoni = rows.length;
    analysis.narxliQatorSoni = rows.filter(r => r.narx !== null).length;
    varaqlar.push(analysis);
    // push(...rows) katta katalogda (100k+ qator) call-stack to'ldiradi — oddiy sikl.
    for (const r of rows) qatorlar.push(r);
  }
  const turi: CatalogManbaTuri | 'noma_lum' = varaqlar.some(v => v.rol === 'ish_haqi_jadvali') ? 'ish_haqi'
    : varaqlar.some(v => v.rol === 'mashina_soat_jadvali' && v.qatorSoni > 0) && !varaqlar.some(v => v.rol === 'narx_jadvali' && v.qatorSoni > 0) ? 'mashina_soat'
    : qatorlar.length ? 'material_katalog' : 'noma_lum';
  const warnings = varaqlar.flatMap(v => v.warnings.map(w => `${v.nom}: ${w}`));
  if (!qatorlar.length) warnings.push('NO_IMPORTABLE_ROWS: import qilinadigan nom+birlik qatori topilmadi');
  return { faylNomi: fileName, turi, davr, varaqlar, qatorlar, warnings, periodNizolari, importgaTayyor: qatorlar.length > 0 && !qatorlar.some(r => r.ogohlantirishlar.some(w => w.startsWith('SHEET_'))) };
}

function parseMachineLine(line: string): MashinaSoatMatnQatori | null {
  const text = CLEAN(line);
  if (!text || text.length < 8 || /наименование|стоимость|машин|механизм|итого|всего/i.test(text) && !/\d/.test(text)) return null;
  const m = text.match(/^(?:\d+\s+)?(.+?)\s+(маш[.\s-]*ч|м[.\s-]*ч|машино[.\s-]*час)\s+([\d\s.,-]+)$/i);
  if (!m) return null;
  return { nom: m[1].trim(), birlik: 'МАШ.-Ч', narx: numberOrNull(m[3]), izoh: `PDF matn qatori: ${text}` };
}

/** PDF parser uchun xavfsiz adapter: faqat tasdiqlangan text extractor natijasini qabul qiladi. */
export function tahlilMashinaSoatMatni(fileName: string, text: string, pages?: string[]): MashinaSoatMatnTahlili {
  const davr = davrAniqla(fileName, text.slice(0, 5000));
  const qatorlar: MashinaSoatMatnQatori[] = [];
  (pages || text.split(/\f/)).forEach((page, pageIndex) => page.split(/\r?\n/).forEach(line => {
    const row = parseMachineLine(line);
    if (row) qatorlar.push({ ...row, sahifa: pageIndex + 1 });
  }));
  // Skanerlangan PDF: sahifalar bor, matn qatlami deyarli yo'q — OCR'siz o'qib bo'lmaydi (taxmin qilinmaydi).
  const sahifaSoni = pages?.length ?? 1;
  const skan = text.replace(/\s+/g, '').length < 60 * sahifaSoni;
  const warnings = qatorlar.length ? [] : [skan
    ? 'PDF_SKAN_MATNSIZ: fayl skanerlangan rasm (matn qatlami yo‘q) — Excel yoki matnli PDF yuklang'
    : 'PDF_TEXT_TABLE_UNRESOLVED: jadvaldan ishonchli mashina-soat qatorlari ajratilmadi'];
  return { faylNomi: fileName, turi: 'mashina_soat', davr, qatorlar, warnings, importgaTayyor: qatorlar.length > 0 };
}

export function mashinaSoatTahliliniCatalogga(tahlil: MashinaSoatMatnTahlili): CatalogTahlil {
  const qatorlar: CatalogQator[] = tahlil.qatorlar.map(function (q) {
    const page = q.sahifa || 1;
    return {
      sourceKey: [tahlil.faylNomi.toLocaleLowerCase(), String(page), norm(q.nom), 'mashch'].join('|'),
      varaqqa: 'PDF / sahifa ' + page,
      manbaQatori: page,
      nom: q.nom,
      birlik: q.birlik,
      kod: null,
      hudud: null,
      narx: q.narx,
      narxVarianti: 'asosiy',
      valyuta: 'UZS',
      davr: tahlil.davr,
      izoh: JSON.stringify({ manba: 'mashina_soat_pdf', sahifa: page, original: q.izoh || null }),
      ogohlantirishlar: q.narx === null ? ['PRICE_MISSING: manbada qiymat ko‘rsatilmagan'] : [],
    };
  });
  return {
    faylNomi: tahlil.faylNomi,
    turi: 'mashina_soat',
    davr: tahlil.davr,
    varaqlar: [{ nom: 'PDF', rol: 'mashina_soat_jadvali', sarlavhaQatori: null, ma_lumotBoshi: null, hudud: null, ustunlar: [], qatorSoni: qatorlar.length, narxliQatorSoni: qatorlar.filter(q => q.narx !== null).length, warnings: tahlil.warnings }],
    qatorlar,
    warnings: tahlil.warnings,
    importgaTayyor: tahlil.importgaTayyor,
  };
}

/** API qatori. Egasi (2026-10-02): "katalog 2026 2-kv Toshkent sh. narxlaridan TTZ zavodidan NDS siz narxi olindi" —
 *  shu izoh uchun hudud, yil/kvartal, narx varianti, NDS holati va zavod sarlavhasi (guruh) alohida maydonlarda.
 *  Zavod nomi va NDS izohini server guruh dan o'zi ajratadi (_t2_katalog_zavod). */
export function catalogQatorlariniApiFormatga(qatorlar: CatalogQator[]) {
  return qatorlar.map(q => {
    let guruh: string | null = null;
    try { const j = JSON.parse(q.izoh || '{}') as { guruh?: unknown }; guruh = typeof j.guruh === 'string' && j.guruh.trim() ? j.guruh : null; } catch { /* izoh JSON emas */ }
    return {
      kod: q.kod, nom: q.nom, birlik: q.birlik, narx: q.narx,
      hudud: q.hudud, guruh, yil: q.davr.yil, kvartal: q.davr.kvartal, narx_varianti: q.narxVarianti,
      nds_holati: q.narxVarianti === 'nds_siz' ? 'nds_siz' : q.narxVarianti === 'nds_bilan' ? 'nds_bilan' : null,
      izoh: JSON.stringify({ sourceKey: q.sourceKey, varaqqa: q.varaqqa, manbaQatori: q.manbaQatori, hudud: q.hudud, davr: q.davr, narxVarianti: q.narxVarianti, valyuta: q.valyuta, originalIzoh: q.izoh, warnings: q.ogohlantirishlar }),
    };
  });
}
