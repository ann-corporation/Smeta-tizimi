/**
 * lib/imzo/qr-varaq.ts - xlsx hujjat OXIRIGA «IMZO» varag'i: har imzolovchi uchun qator (tomon/lavozim, kompaniya, F.I.Sh.,
 * «Elektron imzolangan», sana-vaqt, qisqa imzo kodi) va QR RASMI (haqiqiy PNG rasm; chop etilganda ham chiqadi) + QR ostida havola
 * matni. Hali imzolamagan tomon uchun «imzo kutilmoqda» qatori.
 *
 * Nega alohida varaq (asosiy varaq oxiriga qator emas): rasmiy shakl (F2, F3, AOSR) kataklari, Print_Area va imzo bloklari
 * o'zgarmasin, hamda imzolangan mazmun (kataklar) buzilmasin. IMZO varag'i mazmun xeshiga kirmaydi (mazmun.ts) - qayta
 * imzolash/yangi imzo qo'shish xeshni o'zgartirmaydi.
 *
 * Faqat YANGI qismlar qo'shiladi (varaq, chizma, rasmlar) + workbook.xml, uning rels i, [Content_Types].xml va styles.xml ga qo'shimcha.
 * Avvalgi «IMZO» varag'i (qayta imzolashda) olib tashlanadi.
 */
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { qisqaKod, type ImzoTomon, type ImzoUsul } from './yadro';
import { IMZO_VARAQ_NOMI } from './mazmun';
import { qrPng } from './qr';

export const TOMON_NOMI: Readonly<Record<ImzoTomon, { uz: string; ru: string; zakazchikNomidan?: string }>> = {
  pudratchi: { uz: 'Pudratchi', ru: 'Подрядчик' },
  subpudratchi: { uz: 'Subpudratchi', ru: 'Субподрядчик' },
  buyurtmachi: { uz: 'Buyurtmachi', ru: 'Заказчик' },
  texnadzor: { uz: 'Texnik nazorat', ru: 'Технадзор' },
  loyihachi: { uz: 'Loyihachi', ru: 'Проектировщик' },
  laboratoriya: { uz: 'Laboratoriya', ru: 'Лаборатория' },
  yetkazuvchi: { uz: 'Yetkazuvchi', ru: 'Поставщик' },
  boshqa: { uz: 'Boshqa tomon', ru: 'Другая сторона' },
};

/** «Texnik nazorat (Buyurtmachi nomidan)» / «Технадзор (от имени Заказчика)». `nomidanTomon` - vakolat bergan tomon (bo'lsa). */
export function tomonYorligi(tomon: ImzoTomon, nomidan: ImzoTomon | null, nomidanKompaniya?: string | null): { uz: string; ru: string } {
  const t = TOMON_NOMI[tomon];
  if (!nomidan) return nomidanKompaniya ? { uz: `${t.uz} (${nomidanKompaniya} nomidan)`, ru: `${t.ru} (от имени ${nomidanKompaniya})` } : { uz: t.uz, ru: t.ru };
  const n = TOMON_NOMI[nomidan];
  const ruRod: Record<string, string> = { buyurtmachi: 'Заказчика', pudratchi: 'Подрядчика' };
  return { uz: `${t.uz} (${n.uz} nomidan)`, ru: `${t.ru} (от имени ${ruRod[nomidan] ?? n.ru})` };
}

/** Vakolat bergan tomon (taxmin): texnadzor/loyihachi - Buyurtmachi; subpudratchi/yetkazuvchi/laboratoriya - Pudratchi; aks holda noma'lum (kompaniya nomi ko'rsatiladi). */
export function nomidanTomonTaxmin(tomon: ImzoTomon): ImzoTomon | null {
  if (tomon === 'texnadzor' || tomon === 'loyihachi') return 'buyurtmachi';
  if (tomon === 'subpudratchi' || tomon === 'yetkazuvchi' || tomon === 'laboratoriya') return 'pudratchi';
  return null;
}

export type ImzoBlokQator = {
  tomon: ImzoTomon; nomidan_tomon: ImzoTomon | null; kompaniya: string; fio: string; rol: string; usul: ImzoUsul;
  vaqt: string; /** Odam o'qiy oladigan qisqa imzo kodi (qisqaKod). */ kod: string; token: string;
};
export type ImzoBlokTalab = { imzolar: readonly ImzoBlokQator[]; kutilmoqda: readonly ImzoTomon[]; origin: string; mazmunXesh: string; /** Eksport nashri tokeni: manba QR (imzosiz ham beriladi). */ manbaToken?: string };

const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Keyingi bo'sh raqamli nom (sheetN.xml / drawingN.xml): Excel ham, ExcelJS ham aynan shu nomlashni kutadi. */
const keyingiRaqam = (f: Record<string, Uint8Array>, re: RegExp) => 1 + Math.max(0, ...Object.keys(f).map((k) => Number(re.exec(k)?.[1] ?? 0)));
const RID = 'rIdImzoSheet';

export function sanaMatni(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${g('day')}.${g('month')}.${g('year')} ${g('hour')}:${g('minute')} (UTC+5)`;
}

/** Havola: QR ga yoziladigan va QR ostida ko'rsatiladigan matn. */
export const tekshiruvHavolasi = (origin: string, token: string): string => `${origin.replace(/\/+$/, '')}/t/${token}`;

const atr = (a: string, n: string) => new RegExp(`\\b${n}="([^"]*)"`).exec(a)?.[1] ?? null;
const oqi = (f: Record<string, Uint8Array>, y: string) => (f[y] ? strFromU8(f[y]) : '');

/** Avvalgi «IMZO» varag'ini va unga bog'liq chizma/rasmlarni olib tashlaydi. */
function eskisiniOlibTashla(f: Record<string, Uint8Array>): void {
  let wb = oqi(f, 'xl/workbook.xml'); let rels = oqi(f, 'xl/_rels/workbook.xml.rels'); let ct = oqi(f, '[Content_Types].xml');
  for (const m of [...wb.matchAll(/<sheet\b[^>]*?\/>/g)]) {
    if (atr(m[0], 'name') !== IMZO_VARAQ_NOMI) continue;
    const rid = atr(m[0], 'r:id'); if (!rid) continue;
    const rel = [...rels.matchAll(/<Relationship\b[^>]*?\/>/g)].find((r) => atr(r[0], 'Id') === rid);
    const maqsad = rel && atr(rel[0], 'Target');
    const yol = maqsad ? (maqsad.startsWith('/') ? maqsad.slice(1) : 'xl/' + maqsad) : null;
    const olib: string[] = [];
    if (yol) {
      olib.push(yol);
      const rp = yol.replace(/([^/]+)$/, '_rels/$1.rels'); olib.push(rp);
      for (const d of oqi(f, rp).matchAll(/Target="([^"]*drawing[^"]*)"/g)) {
        const dy = 'xl/' + d[1].replace(/^\.\.\//, ''); olib.push(dy);
        const dr = dy.replace(/([^/]+)$/, '_rels/$1.rels'); olib.push(dr);
        for (const im of oqi(f, dr).matchAll(/Target="([^"]*media[^"]*)"/g)) olib.push('xl/' + im[1].replace(/^\.\.\//, ''));
      }
    }
    for (const y of olib) { delete f[y]; ct = ct.replace(new RegExp(`<Override\\b[^>]*PartName="/${y.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*/>`), ''); }
    wb = wb.replace(m[0], '');
    rels = rels.replace(rel![0], '');
  }
  f['xl/workbook.xml'] = strToU8(wb); f['xl/_rels/workbook.xml.rels'] = strToU8(rels); f['[Content_Types].xml'] = strToU8(ct);
}

/** styles.xml ga qalin/o'ralgan matn uslublari qo'shadi. Qaytaradi: [oddiy, qalin] xf indekslari (yo'q bo'lsa [0, 0]). */
function uslublarQosh(f: Record<string, Uint8Array>): [number, number] {
  let s = oqi(f, 'xl/styles.xml');
  const xfs = /<cellXfs\b[^>]*count="(\d+)"[^>]*>/.exec(s); const fonts = /<fonts\b[^>]*count="(\d+)"[^>]*>/.exec(s);
  if (!xfs || !fonts || !s.includes('</cellXfs>') || !s.includes('</fonts>')) return [0, 0];
  const xn = Number(xfs[1]); const fn = Number(fonts[1]);
  s = s.replace(xfs[0], xfs[0].replace(`count="${xn}"`, `count="${xn + 2}"`)).replace(fonts[0], fonts[0].replace(`count="${fn}"`, `count="${fn + 1}"`));
  s = s.replace('</fonts>', '<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>');
  s = s.replace('</cellXfs>', '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>'
    + `<xf numFmtId="0" fontId="${fn}" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs>`);
  f['xl/styles.xml'] = strToU8(s);
  return [xn, xn + 1];
}

const kat = (ref: string, matn: string, s: number) => `<c r="${ref}" t="inlineStr"${s ? ` s="${s}"` : ''}><is><t xml:space="preserve">${esc(matn)}</t></is></c>`;
const EMU = 9525;

/** xlsx ga «IMZO» varag'ini qo'shadi (yoki yangilaydi). xlsx bo'lmasa - null. */
export function imzoVaraqQosh(bytes: Uint8Array, t: ImzoBlokTalab): Uint8Array | null {
  let f: Record<string, Uint8Array>;
  try { f = unzipSync(bytes); } catch { return null; }
  if (!f['xl/workbook.xml'] || !f['[Content_Types].xml']) return null;
  eskisiniOlibTashla(f);
  const vn = keyingiRaqam(f, /^xl\/worksheets\/sheet(\d+)\.xml$/); const dn = keyingiRaqam(f, /^xl\/drawings\/drawing(\d+)\.xml$/);
  const YOL = { varaq: `xl/worksheets/sheet${vn}.xml`, varaqRels: `xl/worksheets/_rels/sheet${vn}.xml.rels`, chizma: `xl/drawings/drawing${dn}.xml`, chizmaRels: `xl/drawings/_rels/drawing${dn}.xml.rels` };
  const [S, B] = uslublarQosh(f);

  const rows: string[] = []; const pics: { r0: number; rid: string; id: number; url: string }[] = []; const media: Record<string, Uint8Array> = {};
  rows.push(`<row r="1" ht="22" customHeight="1">${kat('A1', 'ЭЛЕКТРОННЫЕ ПОДПИСИ И ИСТОЧНИК · ELEKTRON IMZOLAR VA MANBA (Smeta tizimi)', B)}</row>`);
  rows.push(`<row r="2" ht="44" customHeight="1">${kat('A2', `Hujjat mazmuni kodi / Код содержимого: ${qisqaKod(t.mazmunXesh)}. Imzo tizimdagi hujjat yozuvini himoya qiladi; haqiqiyligi QR orqali tekshiriladi, asl nusxa tizimda saqlanadi. / Подпись защищает запись документа в системе; подлинность проверяется по QR, оригинал хранится в системе.`, S)}</row>`);
  rows.push(`<row r="3" ht="32" customHeight="1">${['Tomon / lavozim · Сторона', 'Kompaniya · Компания', 'F.I.Sh. · Ф.И.О.', 'Holat · Статус', 'Sana-vaqt · Дата-время', 'Imzo kodi · Код подписи', 'QR']
    .map((h, i) => kat(`${'ABCDEFG'[i]}3`, h, B)).join('')}</row>`);
  let r = 4; let id = 2;
  const qrQosh = (url: string, qator: number) => {
    const k = pics.length + 1;
    media[`xl/media/imzoqr${k}.png`] = qrPng(url, 5).png;
    pics.push({ r0: qator - 1, rid: `rIdImzoQr${k}`, id: id++, url });
  };
  if (t.manbaToken) {   // MANBA QR: qog'oz ustidagi QR skaner qilinsa - shu hujjatning Excel nusxasi (tizimga kirgan va ruxsati bor odamga)
    const url = tekshiruvHavolasi(t.origin, t.manbaToken);
    rows.push(`<row r="${r}" ht="84" customHeight="1">${kat(`A${r}`, 'Hujjat manbasi (QR)\nИсточник документа', B)}${kat(`B${r}`, 'Qog\'ozdagi QR ni skaner qiling: hujjatning asl nusxasini tizimdan ochish/yuklab olish mumkin.\nОтсканируйте QR: оригинал документа можно открыть/скачать в системе.', S)}</row>`);
    qrQosh(url, r);
    rows.push(`<row r="${r + 1}" ht="30" customHeight="1">${kat(`G${r + 1}`, url.replace(/^https?:\/\//, ''), S)}</row>`);
    r += 2;
  }
  t.imzolar.forEach((q) => {
    const y = tomonYorligi(q.tomon, q.nomidan_tomon);
    const holat = q.usul === 'eri' ? 'ERI bilan imzolangan\nПодписано ЭЦП' : 'Elektron imzolangan\nПодписано электронно';
    rows.push(`<row r="${r}" ht="84" customHeight="1">${kat(`A${r}`, `${y.uz}\n${y.ru}\n${q.rol}`, S)}${kat(`B${r}`, q.kompaniya, S)}${kat(`C${r}`, q.fio, S)}${kat(`D${r}`, holat, S)}${kat(`E${r}`, sanaMatni(q.vaqt), S)}${kat(`F${r}`, q.kod, B)}</row>`);
    qrQosh(tekshiruvHavolasi(t.origin, q.token), r);
    rows.push(`<row r="${r + 1}" ht="30" customHeight="1">${kat(`G${r + 1}`, tekshiruvHavolasi(t.origin, q.token).replace(/^https?:\/\//, ''), S)}</row>`);
    r += 2;
  });
  for (const tomon of t.kutilmoqda) {
    const y = tomonYorligi(tomon, null);
    rows.push(`<row r="${r}" ht="36" customHeight="1">${kat(`A${r}`, `${y.uz}\n${y.ru}`, S)}${kat(`B${r}`, '—', S)}${kat(`C${r}`, '—', S)}${kat(`D${r}`, 'Imzo kutilmoqda\nОжидается подпись', S)}</row>`);
    r++;
  }
  const kengliklar = [30, 28, 26, 22, 22, 15, 18];
  const varaq = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_R}"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>`
    + `<sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/>`
    + `<cols>${kengliklar.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    + `<sheetData>${rows.join('')}</sheetData><pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>`
    + `<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>${pics.length ? '<drawing r:id="rId1"/>' : ''}</worksheet>`;
  f[YOL.varaq] = strToU8(varaq);

  if (pics.length) {
    f[YOL.varaqRels] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${NS_R}/drawing" Target="../drawings/drawing${dn}.xml"/></Relationships>`);
    const anchors = pics.map((p, i) => `<xdr:oneCellAnchor><xdr:from><xdr:col>6</xdr:col><xdr:colOff>${6 * EMU}</xdr:colOff><xdr:row>${p.r0}</xdr:row><xdr:rowOff>${4 * EMU}</xdr:rowOff></xdr:from>`
      + `<xdr:ext cx="${100 * EMU}" cy="${100 * EMU}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${p.id}" name="IMZO QR ${i + 1}" descr="QR: ${esc(p.url)}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>`
      + `<xdr:blipFill><a:blip r:embed="${p.rid}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${100 * EMU}" cy="${100 * EMU}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`).join('');
    f[YOL.chizma] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${NS_R}">${anchors}</xdr:wsDr>`);
    f[YOL.chizmaRels] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${pics.map((p, i) => `<Relationship Id="${p.rid}" Type="${NS_R}/image" Target="../media/imzoqr${i + 1}.png"/>`).join('')}</Relationships>`);
    Object.assign(f, media);
  }

  // workbook.xml, rels, content types
  let wb = oqi(f, 'xl/workbook.xml');
  const ids = [...wb.matchAll(/<sheet\b[^>]*?\/>/g)].map((m) => Number(atr(m[0], 'sheetId')) || 0);
  const rPref = /<workbook\b[^>]*xmlns:(\w+)="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/relationships"/.exec(wb)?.[1];
  let rootAttr = '';
  if (!rPref) rootAttr = ` xmlns:r="${NS_R}"`;
  const sheetTag = `<sheet name="${IMZO_VARAQ_NOMI}" sheetId="${Math.max(0, ...ids) + 1}" ${rPref ?? 'r'}:id="${RID}"/>`;
  if (!wb.includes('</sheets>')) return null;
  wb = wb.replace('</sheets>', sheetTag + '</sheets>');
  if (rootAttr) wb = wb.replace(/<workbook\b/, `<workbook${rootAttr}`);
  f['xl/workbook.xml'] = strToU8(wb);
  let rels = oqi(f, 'xl/_rels/workbook.xml.rels');
  if (!rels.includes('</Relationships>')) return null;
  f['xl/_rels/workbook.xml.rels'] = strToU8(rels.replace('</Relationships>', `<Relationship Id="${RID}" Type="${NS_R}/worksheet" Target="worksheets/sheet${vn}.xml"/></Relationships>`));
  let ct = oqi(f, '[Content_Types].xml');
  let qosh = `<Override PartName="/${YOL.varaq}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`;
  if (pics.length) {
    qosh += `<Override PartName="/${YOL.chizma}" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`;
    if (!/Extension="png"/i.test(ct)) qosh = '<Default Extension="png" ContentType="image/png"/>' + qosh;
  }
  f['[Content_Types].xml'] = strToU8(ct.replace('</Types>', qosh + '</Types>'));
  return zipSync(f, { level: 6 });
}
