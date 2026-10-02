/**
 * Haqiqiy Excel PIVOT (сводная таблица) — tayyor kitobga qo'shiladi (egasi, 2026-10-02: "kuch yetsa pivot ham").
 *
 * Kitobga ikki varaq qo'shiladi:
 *   • ma'lumot varag'i — bitta sarlavha qatori + tekis jadval (qiymatlar asosiy varaqqa formulalar bilan bog'langan);
 *   • pivot varag'i — <pivotTableDefinition> (qator maydonlari + qiymat maydonlari).
 * Pivot kesh yozuvlari saqlanmaydi (saveData="0"), fayl ochilganda Excel o'zi to'ldiradi (refreshOnLoad="1"):
 * ma'lumot o'zgarsa — "Обновить" kifoya. Qator maydonlarining qiymatlari (items) keshda oldindan yoziladi —
 * Excel pivotFields/items mosligini talab qiladi.
 */
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';

export type PivotKatak = string | number | null | { f: string; v: number | string | null };
export type PivotMaydon = { nom: string; son?: boolean };
export type PivotSozlama = {
  malumotVaraq: string;
  pivotVaraq: string;
  sarlavha: string;
  maydonlar: readonly PivotMaydon[];
  qatorlar: ReadonlyArray<readonly PivotKatak[]>;
  /** Qator o'qidagi maydonlar (indekslar, tartib bilan). */
  qatorMaydon: readonly number[];
  /** Qiymat maydonlari: indeks + ko'rinadigan nom (Сумма по …). */
  qiymatMaydon: ReadonlyArray<{ i: number; nom: string }>;
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const harf = (i: number): string => { let s = ''; i += 1; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
const sonmi = (x: unknown) => typeof x === 'number' && Number.isFinite(x);

function katakXml(ref: string, k: PivotKatak): string {
  if (k == null || k === '') return '';
  if (typeof k === 'number') return Number.isFinite(k) ? `<c r="${ref}"><v>${k}</v></c>` : '';
  if (typeof k === 'string') return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(k)}</t></is></c>`;
  const v = k.v;
  if (v == null || v === '') return `<c r="${ref}"><f>${esc(k.f)}</f></c>`;
  return typeof v === 'number' ? `<c r="${ref}"><f>${esc(k.f)}</f><v>${v}</v></c>` : `<c r="${ref}" t="str"><f>${esc(k.f)}</f><v>${esc(v)}</v></c>`;
}

const qiymat = (k: PivotKatak): string | number | null => (k != null && typeof k === 'object' ? k.v : k) ?? null;

export function pivotQosh(bytes: Uint8Array, o: PivotSozlama): Uint8Array {
  const z = unzipSync(bytes) as Zippable & Record<string, Uint8Array>;
  const wb = strFromU8(z['xl/workbook.xml']);
  const n = (wb.match(/<sheet /g) ?? []).length;
  const m = o.maydonlar.length;
  const oxirC = harf(m - 1);
  const oxirR = o.qatorlar.length + 1;

  // 1) Ma'lumot varag'i (tekis jadval, bitta sarlavha).
  const rows = [`<row r="1">${o.maydonlar.map((f, i) => katakXml(`${harf(i)}1`, f.nom)).join('')}</row>`]
    .concat(o.qatorlar.map((q, r) => `<row r="${r + 2}">${q.map((k, i) => katakXml(`${harf(i)}${r + 2}`, k)).join('')}</row>`));
  const malumot = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + `<dimension ref="A1:${oxirC}${oxirR}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft"/></sheetView></sheetViews>`
    + '<sheetFormatPr defaultRowHeight="15"/>'
    + `<cols>${o.maydonlar.map((f, i) => `<col min="${i + 1}" max="${i + 1}" width="${f.son ? 16 : i === 2 ? 50 : 14}" customWidth="1"/>`).join('')}</cols>`
    + `<sheetData>${rows.join('')}</sheetData><autoFilter ref="A1:${oxirC}${oxirR}"/></worksheet>`;

  // 2) Kesh ta'rifi: qator maydonlari uchun noyob qiymatlar (items), son maydonlari uchun diapazon.
  const noyob = o.maydonlar.map((_f, i) => [...new Set(o.qatorlar.map((q) => qiymat(q[i])).filter((x): x is string | number => x != null && x !== '').map(String))].sort((a, b) => a.localeCompare(b, 'ru')));
  const cacheFields = o.maydonlar.map((f, i) => {
    if (o.qatorMaydon.includes(i)) {
      const bosh = o.qatorlar.some((q) => qiymat(q[i]) == null || qiymat(q[i]) === '');
      return `<cacheField name="${esc(f.nom)}" numFmtId="0"><sharedItems${bosh ? ' containsBlank="1"' : ''} count="${noyob[i].length + (bosh ? 1 : 0)}">${noyob[i].map((s) => `<s v="${esc(s)}"/>`).join('')}${bosh ? '<m/>' : ''}</sharedItems></cacheField>`;
    }
    if (f.son) {
      const sonlar = o.qatorlar.map((q) => qiymat(q[i])).filter(sonmi) as number[];
      const min = sonlar.length ? Math.min(...sonlar) : 0, max = sonlar.length ? Math.max(...sonlar) : 0;
      return `<cacheField name="${esc(f.nom)}" numFmtId="0"><sharedItems containsString="0" containsBlank="1" containsNumber="1" minValue="${min}" maxValue="${max}"/></cacheField>`;
    }
    return `<cacheField name="${esc(f.nom)}" numFmtId="0"><sharedItems containsBlank="1"/></cacheField>`;
  }).join('');
  const cache = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<pivotCacheDefinition xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" saveData="0" refreshOnLoad="1" createdVersion="6" refreshedVersion="6" minRefreshableVersion="3" recordCount="0">'
    + `<cacheSource type="worksheet"><worksheetSource ref="A1:${oxirC}${oxirR}" sheet="${esc(o.malumotVaraq)}"/></cacheSource>`
    + `<cacheFields count="${m}">${cacheFields}</cacheFields></pivotCacheDefinition>`;

  // 3) Pivot jadval.
  const pivotFields = o.maydonlar.map((_f, i) => {
    if (o.qatorMaydon.includes(i)) {
      const k = noyob[i].length + (o.qatorlar.some((q) => qiymat(q[i]) == null || qiymat(q[i]) === '') ? 1 : 0);
      return `<pivotField axis="axisRow" showAll="0"><items count="${k + 1}">${Array.from({ length: k }, (_x, j) => `<item x="${j}"/>`).join('')}<item t="default"/></items></pivotField>`;
    }
    return o.qiymatMaydon.some((d) => d.i === i) ? '<pivotField dataField="1" showAll="0"/>' : '<pivotField showAll="0"/>';
  }).join('');
  const kop = o.qiymatMaydon.length > 1;
  const pivot = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + `<pivotTableDefinition xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" name="${esc(o.sarlavha)}" cacheId="1" applyNumberFormats="0" applyBorderFormats="0" applyFontFormats="0" applyPatternFormats="0" applyAlignmentFormats="0" applyWidthHeightFormats="1" dataCaption="Значения" updatedVersion="6" minRefreshableVersion="3" useAutoFormatting="1" itemPrintTitles="1" createdVersion="6" indent="0" outline="1" outlineData="1" multipleFieldFilters="0">`
    + `<location ref="A3:${harf(o.qiymatMaydon.length)}4" firstHeaderRow="${kop ? 0 : 1}" firstDataRow="1" firstDataCol="1"/>`
    + `<pivotFields count="${m}">${pivotFields}</pivotFields>`
    + `<rowFields count="${o.qatorMaydon.length}">${o.qatorMaydon.map((i) => `<field x="${i}"/>`).join('')}</rowFields>`
    + (kop ? '<colFields count="1"><field x="-2"/></colFields>' : '')
    + `<dataFields count="${o.qiymatMaydon.length}">${o.qiymatMaydon.map((d) => `<dataField name="${esc(d.nom)}" fld="${d.i}" baseField="0" baseItem="0" numFmtId="4"/>`).join('')}</dataFields>`
    + '<pivotTableStyleInfo name="PivotStyleLight16" showRowHeaders="1" showColHeaders="1" showRowStripes="0" showColStripes="0" showLastColumn="1"/>'
    + '</pivotTableDefinition>';
  const pivotVaraq = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + '<sheetFormatPr defaultRowHeight="15"/><cols><col min="1" max="1" width="60" customWidth="1"/>'
    + `<col min="2" max="${o.qiymatMaydon.length + 1}" width="20" customWidth="1"/></cols>`
    + `<sheetData><row r="1">${katakXml('A1', o.sarlavha)}</row></sheetData></worksheet>`;

  // 4) Paketga qo'shish.
  const s1 = n + 1, s2 = n + 2;
  z[`xl/worksheets/sheet${s1}.xml`] = strToU8(malumot);
  z[`xl/worksheets/sheet${s2}.xml`] = strToU8(pivotVaraq);
  z[`xl/worksheets/_rels/sheet${s2}.xml.rels`] = strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/pivotTable" Target="../pivotTables/pivotTable1.xml"/></Relationships>');
  z['xl/pivotTables/pivotTable1.xml'] = strToU8(pivot);
  z['xl/pivotTables/_rels/pivotTable1.xml.rels'] = strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/pivotCacheDefinition" Target="../pivotCache/pivotCacheDefinition1.xml"/></Relationships>');
  z['xl/pivotCache/pivotCacheDefinition1.xml'] = strToU8(cache);

  const ct = strFromU8(z['[Content_Types].xml']).replace('</Types>',
    `<Override PartName="/xl/worksheets/sheet${s1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    + `<Override PartName="/xl/worksheets/sheet${s2}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    + '<Override PartName="/xl/pivotTables/pivotTable1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.pivotTable+xml"/>'
    + '<Override PartName="/xl/pivotCache/pivotCacheDefinition1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.pivotCacheDefinition+xml"/></Types>');
  z['[Content_Types].xml'] = strToU8(ct);

  const rels = strFromU8(z['xl/_rels/workbook.xml.rels']);
  const relS1 = 'rIdP1', relS2 = 'rIdP2', relC = 'rIdP3';
  z['xl/_rels/workbook.xml.rels'] = strToU8(rels.replace('</Relationships>',
    `<Relationship Id="${relS1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${s1}.xml"/>`
    + `<Relationship Id="${relS2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${s2}.xml"/>`
    + `<Relationship Id="${relC}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/pivotCacheDefinition" Target="pivotCache/pivotCacheDefinition1.xml"/></Relationships>`));

  // Pivot varag'i ma'lumot varag'idan oldin (foydalanuvchi uchun muhimrog'i); OOXML: pivotCaches — calcPr dan keyin.
  let w = wb.replace('</sheets>', `<sheet name="${esc(o.pivotVaraq)}" sheetId="${s2}" r:id="${relS2}"/><sheet name="${esc(o.malumotVaraq)}" sheetId="${s1}" r:id="${relS1}"/></sheets>`);
  w = /<calcPr[^>]*\/>/.test(w) ? w.replace(/(<calcPr[^>]*\/>)/, `$1<pivotCaches><pivotCache cacheId="1" r:id="${relC}"/></pivotCaches>`) : w.replace('</workbook>', `<pivotCaches><pivotCache cacheId="1" r:id="${relC}"/></pivotCaches></workbook>`);
  z['xl/workbook.xml'] = strToU8(w);
  return zipSync(z, { level: 6 });
}
