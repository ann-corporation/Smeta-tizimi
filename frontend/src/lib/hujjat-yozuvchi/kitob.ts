/**
 * hujjat-yozuvchi/kitob.ts — workbook darajasidagi amallar: varaq yo'llari,
 * yangi varaq qo'shish, chop etish nomlari (Print_Area / Print_Titles),
 * `.xls` → `.xlsx` o'girish.
 */
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { ustunHarfi, ustunIndeksi, unEsc, xmlEsc, sheetRef } from './ooxml';

/** Workbookdagi varaqlar: nom → ZIP ichidagi yo'l (workbook tartibida). */
export function varaqYollari(files: Record<string, Uint8Array>): Array<{ name: string; path: string }> {
  const wb = strFromU8(files['xl/workbook.xml']);
  const rels = strFromU8(files['xl/_rels/workbook.xml.rels'] ?? new Uint8Array());
  const relMap = new Map<string, string>();
  for (const m of rels.matchAll(/<(?:\w+:)?Relationship\b([^>]*)\/?>/g)) {
    const id = (m[1].match(/\bId="([^"]+)"/) || [])[1];
    const target = (m[1].match(/\bTarget="([^"]+)"/) || [])[1];
    if (id && target) relMap.set(id, target);
  }
  const out: Array<{ name: string; path: string }> = [];
  for (const m of wb.matchAll(/<(?:\w+:)?sheet\b([^>]*)\/?>/g)) {
    const name = (m[1].match(/\bname="([^"]+)"/) || [])[1];
    const rid = (m[1].match(/\b\w+:id="([^"]+)"/) || [])[1];
    const target = rid ? relMap.get(rid) : undefined;
    if (!name || !target) continue;
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
    out.push({ name: unEsc(name), path });
  }
  return out;
}

/** Workbookga yangi varaq qo'shadi (rels, sheets, Content_Types) va Excel
 * ochilganda formulalarni to'liq qayta hisoblashini yoqadi (fullCalcOnLoad). */
export function workbookgaVaraqQosh(files: Record<string, Uint8Array>, nom: string, xml: string): void {
  let n = 1;
  while (files[`xl/worksheets/sheet${n}.xml`]) n++;
  const path = `xl/worksheets/sheet${n}.xml`;
  files[path] = strToU8(xml);

  let rels = strFromU8(files['xl/_rels/workbook.xml.rels']);
  let rid = 1;
  while (new RegExp(`\\bId="rId${rid}"`).test(rels)) rid++;
  const relP = (rels.match(/<(\w+:)?Relationships\b/) || [])[1] ?? '';
  rels = rels.replace(new RegExp(`<\\/${relP}Relationships>`), `<${relP}Relationship Id="rId${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${n}.xml"/></${relP}Relationships>`);
  files['xl/_rels/workbook.xml.rels'] = strToU8(rels);

  let wb = strFromU8(files['xl/workbook.xml']);
  const wp = (wb.match(/<(\w+:)?sheets\b/) || [])[1] ?? '';
  const idAttr = (wb.match(/<(?:\w+:)?sheet\b[^>]*?\b(\w+):id="/) || [])[1] ?? 'r';
  const maxId = Math.max(0, ...[...wb.matchAll(/\bsheetId="(\d+)"/g)].map((m) => Number(m[1])));
  wb = wb.replace(new RegExp(`<\\/${wp}sheets>`), `<${wp}sheet name="${xmlEsc(nom)}" sheetId="${maxId + 1}" ${idAttr}:id="rId${rid}"/></${wp}sheets>`);
  files['xl/workbook.xml'] = strToU8(fullCalcYoq(wb));

  let ct = strFromU8(files['[Content_Types].xml']);
  ct = ct.replace(/<\/Types>/, `<Override PartName="/${path}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`);
  files['[Content_Types].xml'] = strToU8(ct);
}

/** `<calcPr fullCalcOnLoad="1">` — Excel ochilganda hamma formulani qayta hisoblaydi. */
export function fullCalcYoq(wbXml: string): string {
  let wb = wbXml;
  const wp = (wb.match(/<(\w+:)?workbook\b/) || [])[1] ?? '';
  const calc = new RegExp(`<${wp}calcPr\\b([^>]*?)\\/?>`);
  if (calc.test(wb)) {
    return wb.replace(calc, (all: string, attrs: string) => /fullCalcOnLoad=/.test(attrs) ? all : all.replace(/\s*\/?>$/, (e) => ` fullCalcOnLoad="1"${e.trim()}`));
  }
  const after = ['oleSize', 'customWorkbookViews', 'pivotCaches', 'smartTagPr', 'smartTagTypes', 'webPublishing', 'fileRecoveryPr', 'webPublishObjects', 'extLst'];
  const anchor = after.map((t) => wb.search(new RegExp(`<${wp}${t}\\b`))).filter((i) => i >= 0).sort((a, b) => a - b)[0];
  const tag = `<${wp}calcPr calcId="0" fullCalcOnLoad="1"/>`;
  wb = anchor != null ? wb.slice(0, anchor) + tag + wb.slice(anchor) : wb.replace(new RegExp(`<\\/${wp}workbook>`), `${tag}</${wp}workbook>`);
  return wb;
}

/** Varaqning _xlnm.Print_Area nomi: ustunlar yangi oxirgi ustungacha, qatorlar
 * (agar u jadval oxirini qamragan bo‘lsa) imzo blokigacha kengayadi. */
export function printAreaKengaytir(wbXml: string, sheetIndex: number, oxirgiUstun: number, jadvalOxiri: number, imzoOxiri: number): string {
  const re = new RegExp(`(<(?:\\w+:)?definedName\\b[^>]*?\\bname="_xlnm\\.Print_Area"[^>]*?\\blocalSheetId="${sheetIndex}"[^>]*>)([^<]*)(<\\/(?:\\w+:)?definedName>)`);
  return wbXml.replace(re, (all, a: string, ref: string, z: string) => {
    const m = ref.match(/^(.*!)\$([A-Z]+)\$(\d+):\$([A-Z]+)\$(\d+)$/);
    if (!m) return all; // bir nechta hudud yoki boshqa shakl — tegilmaydi
    const endCol = Math.max(ustunIndeksi(m[4]), oxirgiUstun);
    const endRow = Number(m[5]) >= jadvalOxiri ? Math.max(Number(m[5]), imzoOxiri) : Number(m[5]);
    return `${a}${m[1]}$${m[2]}$${m[3]}:$${ustunHarfi(endCol)}$${endRow}${z}`;
  });
}

/** Varaq uchun defined name bormi (masalan `_xlnm.Print_Titles`). */
export function definedNameBormi(wbXml: string, nom: string, sheetIndex: number): boolean {
  return new RegExp(`<(?:\\w+:)?definedName\\b[^>]*?\\bname="${nom.replace(/\./g, '\\.')}"[^>]*?\\blocalSheetId="${sheetIndex}"`).test(wbXml)
    || new RegExp(`<(?:\\w+:)?definedName\\b[^>]*?\\blocalSheetId="${sheetIndex}"[^>]*?\\bname="${nom.replace(/\./g, '\\.')}"`).test(wbXml);
}

/** Yangi defined name qo'shadi (yo'q bo'lsa). Chop etish nomlari standart
 * bo'yicha absolyut (`$`) — bu hujayra formulasi emas, H6 ga taalluqli emas. */
export function definedNameQosh(wbXml: string, nom: string, sheetIndex: number, qiymat: string): string {
  if (definedNameBormi(wbXml, nom, sheetIndex)) return wbXml;
  const wp = (wbXml.match(/<(\w+:)?workbook\b/) || [])[1] ?? '';
  const el = `<${wp}definedName name="${nom}" localSheetId="${sheetIndex}">${xmlEsc(qiymat)}</${wp}definedName>`;
  const dn = new RegExp(`<${wp}definedNames\\b[^>]*>`);
  if (dn.test(wbXml)) return wbXml.replace(new RegExp(`<\\/${wp}definedNames>`), `${el}</${wp}definedNames>`);
  const selfClose = new RegExp(`<${wp}definedNames\\s*\\/>`);
  if (selfClose.test(wbXml)) return wbXml.replace(selfClose, `<${wp}definedNames>${el}</${wp}definedNames>`);
  return wbXml.replace(new RegExp(`(<\\/${wp}sheets>)`), `$1<${wp}definedNames>${el}</${wp}definedNames>`);
}

/** Sarlavha qatorlari har sahifada takrorlanadi (H4): `'Varaq'!$4:$5`. */
export function printTitlesQiymati(varaq: string, r1: number, r2: number): string {
  return `${sheetRef(varaq)}!$${r1}:$${r2}`;
}

/** Chop hududi: `'Varaq'!$A$1:$H$60`. */
export function printAreaQiymati(varaq: string, oxirgiUstun: number, oxirgiQator: number): string {
  return `${sheetRef(varaq)}!$A$1:$${ustunHarfi(oxirgiUstun)}$${oxirgiQator}`;
}

/** `.xls` (BIFF8) → `.xlsx`. Bayt darajasida patch qilib bo'lmaydi; natija
 * `saqlanish: 'qisman'` deb halol belgilanadi (H8). */
export async function xlsdanXlsx(bytes: Uint8Array): Promise<Uint8Array> {
  const XLSX = await import('xlsx-js-style');
  const wb = XLSX.read(bytes, { type: 'array', cellStyles: true, cellNF: true, cellFormula: true });
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx', cellStyles: true });
  return out instanceof Uint8Array ? out : new Uint8Array(out as ArrayBuffer);
}

/**
 * Keshsiz formula kataklariga bo'sh matn keshini qo'yadi (`t="str"`, `<v></v>`).
 * exceljs qayta yozishda natijasi "" bo'lgan formulaning keshini tashlab
 * yuboradi; bunday katak qayta hisoblamaydigan ko'ruvchida 0 emas, bo'sh
 * ko'rinishi kerak (NULL ≠ 0). Faqat natijasi haqiqatan "" bo'lgan formulalar
 * uchun chaqiriladi — `scripts/hujjat-lo-tekshir.mjs` buni qayta hisoblash
 * bilan tasdiqlaydi.
 */
export function boshKeshQoy(bytes: Uint8Array, varaqlar?: readonly string[]): Uint8Array {
  const files = unzipSync(bytes);
  const yollar = varaqYollari(files).filter((y) => !varaqlar || varaqlar.includes(y.name));
  for (const y of yollar) {
    const x = files[y.path];
    if (!x) continue;
    const xml = strFromU8(x);
    const yangi = xml.replace(/<((?:\w+:)?c)\b([^>]*?)>(<(?:\w+:)?f\b[^>]*>[^<]*<\/(?:\w+:)?f>)<\/\1>/g, (_m, tag: string, attrs: string, f: string) => {
      const p = tag.includes(':') ? tag.split(':')[0] + ':' : '';
      const at = attrs.replace(/\s+t="[^"]*"/, '');
      return `<${tag}${at} t="str">${f}<${p}v></${p}v></${tag}>`;
    });
    if (yangi !== xml) files[y.path] = strToU8(yangi);
  }
  return zipSync(files, { level: 6 });
}

/**
 * Excel "yashil uchburchak" ogohlantirishlarini o'chiradi (egasi 2026-09-30: "kompyuterda ochsam
 * xato va uvedomleniyalar chiqadi"). Resurs kodlari ('000001', '1942') ataylab MATN — boshidagi nol
 * yo'qolmasin; Excel ularni "Число сохранено как текст" deb belgilardi. Ota qatorda SUMIF, bargda
 * H=F×G — "Несогласованная формула" / "Формула не охватывает смежные ячейки" ham ma'noli emas.
 * `<ignoredErrors>` OOXML tartibida (`smartTags`/`drawing`/…/`extLst` dan oldin) qo'yiladi.
 */
export function ogohlantirishlarniOchir(bytes: Uint8Array, varaqlar?: readonly string[]): Uint8Array {
  const files = unzipSync(bytes);
  const yollar = varaqYollari(files).filter((y) => !varaqlar || varaqlar.includes(y.name));
  const EL = '<ignoredErrors><ignoredError sqref="A1:XFD1048576" numberStoredAsText="1" formula="1" formulaRange="1" unlockedFormula="1"/></ignoredErrors>';
  for (const y of yollar) {
    const x = files[y.path];
    if (!x) continue;
    let xml = strFromU8(x);
    if (/<(?:\w+:)?ignoredErrors\b/.test(xml)) continue;
    const m = xml.match(/<(?:\w+:)?(?:smartTags|drawing|legacyDrawing|legacyDrawingHF|picture|oleObjects|controls|webPublishItems|tableParts|extLst)\b|<\/(?:\w+:)?worksheet>/);
    if (!m || m.index == null) continue;
    xml = xml.slice(0, m.index) + EL + xml.slice(m.index);
    files[y.path] = strToU8(xml);
  }
  return zipSync(files, { level: 6 });
}

/** Chop nomlarini (Print_Area / Print_Titles) to'liq absolyut shaklga keltiradi:
 * exceljs `$A1:$W42` yozadi — nisbiy qator raqami defined name da faol katakka
 * bog'lanib siljishi mumkin; standart shakl `$A$1:$W$42`. */
export function chopNomlariAbsolyut(bytes: Uint8Array): Uint8Array {
  const files = unzipSync(bytes);
  const wb = strFromU8(files['xl/workbook.xml']);
  const yangi = wb.replace(/(<(?:\w+:)?definedName\b[^>]*\bname="_xlnm\.Print_(?:Area|Titles)"[^>]*>)([^<]*)(<\/)/g, (_m, a: string, ref: string, z: string) =>
    `${a}${ref.replace(/\$([A-Z]{1,3})(\d+)/g, '$$$1$$$2')}${z}`);
  if (yangi === wb) return bytes;
  files['xl/workbook.xml'] = strToU8(yangi);
  return zipSync(files, { level: 6 });
}
