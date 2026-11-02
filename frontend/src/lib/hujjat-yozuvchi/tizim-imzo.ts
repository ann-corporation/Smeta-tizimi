/**
 * hujjat-yozuvchi/tizim-imzo.ts — tizimdan chiqqan HAR hujjatdagi tizim imzosi (egasi, 2026-10-27:
 * «tizimdan chiqayotgan har bir hujjatda tizim uchun imzo qoldirilishi kerak — kolontitul yoki background»).
 *
 * YAGONA joy: fayl foydalanuvchiga beriladigan yo'l (`downloadBlob`) shu funksiyani chaqiradi — har eksport
 * alohida imzo yozmaydi. Excel (xlsx/xlsm) va ichida xlsx bo'lgan zip paket qamrab olinadi.
 *
 * Imzo — FAQAT kolontitul va hujjat xususiyatlari: kataklar, maket, Print_Area, rasmiy shakl (F2, F3, LRV)
 * va undagi imzo bloklari (ЗАКАЗЧИК/ПОДРЯДЧИК) o'zgarmaydi. Kolontitul sahifa chetida (margin) bosiladi.
 *   • pastki kolontitul: chapda «Smeta tizimi · smeta-tizimi.pages.dev · <hujjat>», o'ngda
 *     «<foydalanuvchi> · <sana vaqt> · Код <tekshirish kodi>»; markazdagi mavjud matn (Страница &P из &N) saqlanadi.
 *     Shablonning pastki chap/o'ng qismi band bo'lsa — yuqori kolontitulga, u ham band bo'lsa — o'ng qism oxiriga.
 *   • xususiyatlar: Creator / Company / Application «Smeta tizimi», LastModifiedBy — foydalanuvchi,
 *     Description va Keywords — tekshirish kodi.
 *
 * Tekshirish kodi — hujjat MAZMUNI xeshi (varaqlar + sharedStrings; kolontitul va docProps hisobga olinmaydi):
 * bir xil hujjat → bir xil kod, qayta imzolash kodni o'zgartirmaydi. Kodni serverda saqlash (haqiqiylikni
 * tekshirish sahifasi) — keyingi bosqich; hozir faqat ko'rsatiladi.
 *
 * PDF: hozir main da PDF yaratuvchi yo'q (jspdf ishlatilmaydi). PDF qo'shilsa — shu modulga `TIZIM_IMZO_BREND`
 * va `tizimImzoKodi` bilan har sahifa pastiga kolontitul + och diagonal fon belgisi qo'shiladi.
 */
import { strFromU8, strToU8, unzipSync, zipSync, type Unzipped } from 'fflate';
import { isZip, unEsc, xmlEsc } from './ooxml';
import { tizimImzoJoriyFoydalanuvchi } from './tizim-imzo-foydalanuvchi';

export const TIZIM_IMZO_BREND = 'Smeta tizimi';
export const TIZIM_IMZO_SAYT = 'smeta-tizimi.pages.dev';
const BELGI = `${TIZIM_IMZO_BREND} · ${TIZIM_IMZO_SAYT}`;
const KOD_RE = /Код [0-9A-Z]{5}-[0-9A-Z]{5}/;
/** Excel kolontitul qismi uchun cheklov (255 belgidan oshsa Excel faylni «tiklaydi»). */
const MAX_KOLONTITUL = 250;
const USLUB = '&7&K808080';

export type TizimImzoMeta = { hujjat?: string | null; foydalanuvchi?: string | null; vaqt?: Date };

// ───────────────────────── foydalanuvchi ─────────────────────────

export { tizimImzoFoydalanuvchi } from './tizim-imzo-foydalanuvchi';

// ───────────────────────── tekshirish kodi ─────────────────────────

const ALIFBO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32 (I, L, O, U yo'q)

/** Ikki mustaqil 32-bit FNV-1a/murmur aralashmasi → 50 bit → 10 belgi `XXXXX-XXXXX`. Sinxron, deterministik. */
function kod10(qismlar: readonly Uint8Array[]): string {
  let h1 = 0x811c9dc5, h2 = 0x9747b28c;
  for (const q of qismlar) {
    for (let i = 0; i < q.length; i++) {
      h1 = Math.imul(h1 ^ q[i], 0x01000193);
      h2 = Math.imul(h2 ^ q[i], 0x5bd1e995);
      h2 ^= h2 >>> 15;
    }
    h1 = Math.imul(h1 ^ 0xff, 0x01000193); // qism chegarasi
  }
  h1 >>>= 0; h2 >>>= 0;
  let s = '';
  // 25 bit h1 dan, 25 bit h2 dan
  for (let i = 0; i < 5; i++) s += ALIFBO[(h1 >>> (i * 5)) & 31];
  for (let i = 0; i < 5; i++) s += ALIFBO[(h2 >>> (i * 5)) & 31];
  return `${s.slice(0, 5)}-${s.slice(5)}`;
}

const VARAQ = /^xl\/worksheets\/[^/]+\.xml$/;
const KOLONTITUL_RE = /<((?:\w+:)?headerFooter)\b[^>]*?(?:\/>|>[\s\S]*?<\/\1>)/g;

function kodFayllardan(f: Unzipped): string {
  const yollar = Object.keys(f).filter((p) => VARAQ.test(p) || p === 'xl/sharedStrings.xml').sort();
  return kod10(yollar.flatMap((p) => [strToU8(p), VARAQ.test(p) ? strToU8(strFromU8(f[p]).replace(KOLONTITUL_RE, '')) : f[p]]));
}

/** Hujjat mazmunidan barqaror tekshirish kodi (xlsx). O'qib bo'lmasa — bayt xeshi. */
export function tizimImzoKodi(bytes: Uint8Array): string {
  if (isZip(bytes)) {
    try { return kodFayllardan(unzipSync(bytes)); } catch { /* pastga */ }
  }
  return kod10([bytes]);
}

// ───────────────────────── kolontitul ─────────────────────────

type Bolim = { L: string; C: string; R: string };

/** Excel kolontitul matnini &L/&C/&R qismlarga ajratadi (`&&` — oddiy belgi). */
export function kolontitulBolimlari(s: string): Bolim {
  const r: Bolim = { L: '', C: '', R: '' };
  let joriy: keyof Bolim = 'C';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '&' && i + 1 < s.length) {
      const n = s[i + 1];
      if (n === 'L' || n === 'C' || n === 'R') { joriy = n; i++; continue; }
      r[joriy] += ch + n; i++; continue;
    }
    r[joriy] += ch;
  }
  return r;
}

const yigish = (b: Bolim): string => `${b.L ? `&L${b.L}` : ''}${b.C ? `&C${b.C}` : ''}${b.R ? `&R${b.R}` : ''}`;
const amp = (s: string): string => s.replace(/&/g, '&&');
/** Avvalgi tizim imzosi (qayta imzolashda) — bo'sh deb qaraladi. */
const bizniki = (s: string): boolean => s.includes(TIZIM_IMZO_SAYT) || KOD_RE.test(s);
const tozala = (b: Bolim): Bolim => ({ L: bizniki(b.L) ? '' : b.L, C: b.C, R: bizniki(b.R) ? '' : b.R });

function sanaMatni(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Imzo qismlari (Excel kolontitul sintaksisida, `&` qochirilgan). */
export function tizimImzoQismlari(kod: string, m: TizimImzoMeta): { chap: string; ong: string } {
  const ong = [m.foydalanuvchi?.trim(), sanaMatni(m.vaqt ?? new Date()), `Код ${kod}`].filter(Boolean).join(' · ');
  const ongQ = USLUB + amp(ong);
  const hujjat = (m.hujjat ?? '').replace(/\.(xlsx|xlsm|xls|zip)$/i, '').trim();
  let chap = BELGI + (hujjat ? ` · ${hujjat}` : '');
  // Umumiy uzunlik (markazdagi «Страница» bilan) 255 dan oshmasin — hujjat nomi qisqartiriladi.
  const sigadi = MAX_KOLONTITUL - 60 - ongQ.length - USLUB.length;
  if (amp(chap).length > sigadi) chap = chap.slice(0, Math.max(BELGI.length, sigadi - 1)) + '…';
  return { chap: USLUB + amp(chap), ong: ongQ };
}

const KOLONTITUL_KEYIN = ['rowBreaks', 'colBreaks', 'customProperties', 'cellWatches', 'ignoredErrors', 'smartTags', 'drawing', 'legacyDrawing', 'legacyDrawingHF', 'picture', 'oleObjects', 'controls', 'webPublishItems', 'tableParts', 'extLst'];

/** Bitta varaq XML iga imzo kolontitulini yozadi (mavjud markaziy qism saqlanadi). */
export function varaqqaTizimImzosi(xml: string, q: { chap: string; ong: string }): string {
  const p = (xml.match(/<(\w+:)?worksheet\b/) || [])[1] ?? '';
  const mavjud = xml.match(new RegExp(`<${p}headerFooter\\b([^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/${p}headerFooter>)`));
  const attrs = mavjud?.[1] ?? '';
  const ichi = mavjud?.[2] ?? '';
  const ol = (tag: string): string | null => {
    const m = ichi.match(new RegExp(`<${p}${tag}\\b[^>]*>([\\s\\S]*?)<\\/${p}${tag}>`));
    return m ? unEsc(m[1]) : null;
  };
  const turlar = ['odd', ...(/\bdifferentOddEven="(1|true)"/.test(attrs) ? ['even'] : []), ...(/\bdifferentFirst="(1|true)"/.test(attrs) ? ['first'] : [])];
  const natija: Record<string, string> = {};
  for (const tag of ['oddHeader', 'oddFooter', 'evenHeader', 'evenFooter', 'firstHeader', 'firstFooter']) {
    const v = ol(tag);
    if (v != null) natija[tag] = v;
  }
  for (const t of turlar) {
    const past = tozala(kolontitulBolimlari(natija[`${t}Footer`] ?? ''));
    const tepa = tozala(kolontitulBolimlari(natija[`${t}Header`] ?? ''));
    if (!past.L && !past.R) { past.L = q.chap; past.R = q.ong; }
    else if (!tepa.L && !tepa.R) { tepa.L = q.chap; tepa.R = q.ong; }
    else past.R = `${past.R} ${q.chap} ${q.ong}`;
    natija[`${t}Footer`] = yigish(past);
    const h = yigish(tepa);
    if (h) natija[`${t}Header`] = h; else delete natija[`${t}Header`];
  }
  const el = `<${p}headerFooter${attrs}>`
    + ['oddHeader', 'oddFooter', 'evenHeader', 'evenFooter', 'firstHeader', 'firstFooter']
      .filter((tag) => natija[tag]).map((tag) => `<${p}${tag}>${xmlEsc(natija[tag])}</${p}${tag}>`).join('')
    + `</${p}headerFooter>`;
  if (mavjud) return xml.replace(mavjud[0], () => el);
  const idx = KOLONTITUL_KEYIN.map((t) => xml.search(new RegExp(`<${p}${t}\\b`))).filter((i) => i >= 0).sort((a, b) => a - b)[0];
  return idx != null ? xml.slice(0, idx) + el + xml.slice(idx) : xml.replace(new RegExp(`<\\/${p}worksheet>`), `${el}</${p}worksheet>`);
}

// ───────────────────────── hujjat xususiyatlari ─────────────────────────

const ISO = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

function coreXml(eski: string | null, kod: string, m: TizimImzoMeta): string {
  const ol = (tag: string) => (eski?.match(new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([^<]*)<`)) || [])[1];
  const title = ol('title');
  const subject = ol('subject');
  const created = ol('created');
  const vaqt = ISO(m.vaqt ?? new Date());
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
    + (title ? `<dc:title>${title}</dc:title>` : '')
    + (subject ? `<dc:subject>${subject}</dc:subject>` : '')
    + `<dc:creator>${xmlEsc(TIZIM_IMZO_BREND)}</dc:creator>`
    + `<cp:keywords>${xmlEsc(`${TIZIM_IMZO_BREND}; Код ${kod}`)}</cp:keywords>`
    + `<dc:description>${xmlEsc(`${BELGI} · Код проверки ${kod}${m.foydalanuvchi ? ` · ${m.foydalanuvchi}` : ''}`)}</dc:description>`
    + `<cp:lastModifiedBy>${xmlEsc(m.foydalanuvchi?.trim() || TIZIM_IMZO_BREND)}</cp:lastModifiedBy>`
    + `<dcterms:created xsi:type="dcterms:W3CDTF">${created || vaqt}</dcterms:created>`
    + `<dcterms:modified xsi:type="dcterms:W3CDTF">${vaqt}</dcterms:modified>`
    + '</cp:coreProperties>';
}

function appXml(eski: string | null): string {
  const qiymat = { Application: TIZIM_IMZO_BREND, Company: BELGI };
  if (!eski) {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">'
      + `<Application>${xmlEsc(qiymat.Application)}</Application><Company>${xmlEsc(qiymat.Company)}</Company></Properties>`;
  }
  const p = (eski.match(/<(\w+:)?Properties\b/) || [])[1] ?? '';
  let x = eski;
  for (const [tag, v] of Object.entries(qiymat)) {
    const re = new RegExp(`<${p}${tag}\\b[^>]*?(?:\\/>|>[^<]*<\\/${p}${tag}>)`);
    const el = `<${p}${tag}>${xmlEsc(v)}</${p}${tag}>`;
    x = re.test(x) ? x.replace(re, () => el) : x.replace(new RegExp(`<\\/${p}Properties>`), `${el}</${p}Properties>`);
  }
  return x;
}

function paketBogla(f: Unzipped, qism: string, tur: string, rel: string): void {
  const ctYol = '[Content_Types].xml';
  if (f[ctYol]) {
    const ct = strFromU8(f[ctYol]);
    if (!ct.includes(`PartName="/${qism}"`)) f[ctYol] = strToU8(ct.replace(/<\/(\w+:)?Types>/, (z) => `<Override PartName="/${qism}" ContentType="${tur}"/>${z}`));
  }
  if (f['_rels/.rels']) {
    const r = strFromU8(f['_rels/.rels']);
    if (!r.includes(`Target="${qism}"`) && !r.includes(`Target="/${qism}"`)) {
      let n = 1;
      while (new RegExp(`\\bId="rId${n}"`).test(r)) n++;
      f['_rels/.rels'] = strToU8(r.replace(/<\/(\w+:)?Relationships>/, (z) => `<Relationship Id="rId${n}" Type="${rel}" Target="${qism}"/>${z}`));
    }
  }
}

// ───────────────────────── asosiy kirish ─────────────────────────

function xlsxImzola(f: Unzipped, m: TizimImzoMeta): void {
  const kod = kodFayllardan(f);
  const q = tizimImzoQismlari(kod, m);
  for (const p of Object.keys(f)) {
    if (VARAQ.test(p)) f[p] = strToU8(varaqqaTizimImzosi(strFromU8(f[p]), q));
  }
  const core = f['docProps/core.xml'] ? strFromU8(f['docProps/core.xml']) : null;
  f['docProps/core.xml'] = strToU8(coreXml(core, kod, m));
  if (!core) paketBogla(f, 'docProps/core.xml', 'application/vnd.openxmlformats-package.core-properties+xml', 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties');
  const app = f['docProps/app.xml'] ? strFromU8(f['docProps/app.xml']) : null;
  f['docProps/app.xml'] = strToU8(appXml(app));
  if (!app) paketBogla(f, 'docProps/app.xml', 'application/vnd.openxmlformats-officedocument.extended-properties+xml', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties');
}

const xlsxmi = (f: Unzipped): boolean => !!f['xl/workbook.xml'];

/**
 * Faylga tizim imzosini qo'yadi: xlsx/xlsm — kolontitul + xususiyatlar; zip paket — ichidagi har xlsx.
 * Boshqa tur (pdf, json, .xls) yoki o'qib bo'lmaydigan fayl — o'zgarishsiz qaytadi (berish hech qachon to'xtamaydi).
 */
export function tizimImzosiniQoy(bytes: Uint8Array, m: TizimImzoMeta = {}): Uint8Array {
  if (!isZip(bytes)) return bytes;
  const meta: TizimImzoMeta = { ...m, foydalanuvchi: m.foydalanuvchi ?? tizimImzoJoriyFoydalanuvchi(), vaqt: m.vaqt ?? new Date() };
  try {
    const f = unzipSync(bytes);
    if (xlsxmi(f)) {
      xlsxImzola(f, meta);
      return zipSync(f, { level: 6 });
    }
    let ozgardi = false;
    for (const [nom, b] of Object.entries(f)) {
      if (!/\.xls[xm]$/i.test(nom) || !isZip(b)) continue;
      const ichki = unzipSync(b);
      if (!xlsxmi(ichki)) continue;
      xlsxImzola(ichki, { ...meta, hujjat: nom.split('/').pop() ?? nom });
      f[nom] = zipSync(ichki, { level: 6 });
      ozgardi = true;
    }
    return ozgardi ? zipSync(f, { level: 6 }) : bytes;
  } catch (e) {
    console.warn('tizim imzosi qo‘yilmadi', e);
    return bytes;
  }
}
