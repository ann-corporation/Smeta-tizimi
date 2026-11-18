/**
 * hujjat-matn.ts - Hujjat maydoni: yuklashda matn ajratish (pdf / docx / xlsx / pptx / oddiy matn) va qidiruv normalizatsiyasi.
 * Qoidalar: server tomonida, hajm bilan CHEKLANGAN (kirish <= MATN_MAX_KIRISH, har zip yozuvi <= 40 MB, natija <= MATN_MAX_CHIQISH),
 * xato bo'lsa jim bo'sh qaytadi (yuklash hech qachon buzilmaydi). Natija: R2 dagi to'liq matn (r2 kalit + '.txt') va Postgres'dagi
 * ixcham tsvector (faqat so'zlar, pozitsiyasiz) - baza kichik qoladi.
 * Cheklov: skanerlangan (rasm) PDF va ToUnicode xaritasi yo'q PDF'lar faqat nomi bilan qidiriladi (OCR yo'q).
 */
import { strFromU8, unzipSync, unzlibSync } from 'fflate';

export const MATN_MAX_KIRISH = 20 * 1024 * 1024;
export const MATN_MAX_CHIQISH = 1024 * 1024;
const ZIP_YOZUV_MAX = 40 * 1024 * 1024;

const KIRILL: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
  р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya',
  ў: 'o', қ: 'q', ғ: 'g', ҳ: 'h',
};

/** Qidiruv kaliti: registr, lotin/kirill va apostrof farqsiz; faqat [a-z0-9] so'zlari bo'sh joy bilan. (Klient qidiruvKaliti bilan bir xil g'oya.) */
export function qidiruvNorm(s: unknown): string {
  let o = '';
  for (const ch of String(s ?? '').normalize('NFKC').toLowerCase()) {
    if (/[‘’ʻʼ'`´]/.test(ch)) continue;
    o += KIRILL[ch] ?? ch;
  }
  return o.replace(/[^a-z0-9]+/g, ' ').trim();
}

/** So'rovdan prefiks-qidiruv so'zlari (<= 6, har biri >= 2 belgi). */
export function qidiruvSozlar(q: unknown): string[] {
  return [...new Set(qidiruvNorm(q).split(' ').filter((w) => w.length >= 2))].slice(0, 6);
}

const MATN_KENGAYTMA = /\.(txt|md|csv|tsv|log|json|xml|html?|rtf)$/i;
export const matnAjratadimi = (nom: string, mime: string): boolean =>
  /\.(pdf|docx|xlsx|pptx)$/i.test(nom) || MATN_KENGAYTMA.test(nom) || /^text\/(plain|csv|markdown)$/i.test(mime);

const entitet = (s: string) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => { const c = Number(n); return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : ' '; })
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => { const c = parseInt(n, 16); return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : ' '; })
  .replace(/&amp;/g, '&');

function zipOl(b: Uint8Array, tanla: (nom: string) => boolean): Record<string, Uint8Array> {
  return unzipSync(b, { filter: (f) => f.originalSize <= ZIP_YOZUV_MAX && tanla(f.name) });
}
const tartibli = (o: Record<string, Uint8Array>) => Object.keys(o).sort((a, c) => a.localeCompare(c, undefined, { numeric: true }));

function docx(b: Uint8Array): string {
  const z = zipOl(b, (n) => n === 'word/document.xml' || /^word\/(header|footer|footnotes|endnotes)\d*\.xml$/.test(n));
  let out = '';
  for (const k of tartibli(z)) {
    out += strFromU8(z[k]).replace(/<w:tab\s*\/>/g, '\t').replace(/<\/w:p>|<w:br\s*\/>/g, '\n').replace(/<[^>]+>/g, '') + '\n';
    if (out.length > MATN_MAX_CHIQISH * 2) break;
  }
  return entitet(out);
}
function pptx(b: Uint8Array): string {
  const z = zipOl(b, (n) => /^ppt\/(slides\/slide|notesSlides\/notesSlide)\d+\.xml$/.test(n));
  let out = '';
  for (const k of tartibli(z)) {
    out += strFromU8(z[k]).replace(/<\/a:p>/g, '\n').replace(/<[^>]+>/g, '') + '\n';
    if (out.length > MATN_MAX_CHIQISH * 2) break;
  }
  return entitet(out);
}
function xlsx(b: Uint8Array): string {
  const z = zipOl(b, (n) => n === 'xl/sharedStrings.xml' || n === 'xl/workbook.xml');
  let out = '';
  const wb = z['xl/workbook.xml'] ? strFromU8(z['xl/workbook.xml']) : '';
  for (const m of wb.matchAll(/<sheet\b[^>]*\bname="([^"]*)"/g)) out += m[1] + '\n';
  const ss = z['xl/sharedStrings.xml'] ? strFromU8(z['xl/sharedStrings.xml']) : '';
  for (const m of ss.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    out += m[1].replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').replace(/<[^>]+>/g, '') + '\n';
    if (out.length > MATN_MAX_CHIQISH * 2) break;
  }
  return entitet(out);
}

// ---- PDF (minimal: Flate oqimlari + Tj/TJ; ToUnicode xaritalari umumiy birlashtiriladi) ----
function pdfOqimlar(b: Uint8Array): string[] {
  const s = Array.from({ length: Math.ceil(b.length / 65536) }, (_, i) => String.fromCharCode(...b.subarray(i * 65536, (i + 1) * 65536))).join('');
  const out: string[] = []; let jami = 0; let pos = 0;
  while (out.length < 3000 && jami < 24 * 1024 * 1024) {
    const i = s.indexOf('stream', pos); if (i < 0) break;
    if (s.startsWith('endstream', i - 3)) { pos = i + 6; continue; }
    let boshi = i + 6; if (s[boshi] === '\r') boshi++; if (s[boshi] === '\n') boshi++;
    const oxiri = s.indexOf('endstream', boshi); if (oxiri < 0) break;
    const lugat = s.slice(Math.max(0, i - 500), i); const lb = lugat.lastIndexOf('<<');
    const flate = /\/FlateDecode/.test(lb >= 0 ? lugat.slice(lb) : lugat);
    pos = oxiri + 9;
    if (/\/Subtype\s*\/Image/.test(lb >= 0 ? lugat.slice(lb) : lugat)) continue;
    try {
      const xom = b.subarray(boshi, oxiri);
      const d = flate ? unzlibSync(xom) : xom;
      if (d.length > 8 * 1024 * 1024) continue;
      let t = ''; for (let k = 0; k < d.length; k += 65536) t += String.fromCharCode(...d.subarray(k, k + 65536));
      jami += t.length; out.push(t);
    } catch { /* buzilgan/shifrlangan oqim - o'tkaziladi */ }
  }
  return out;
}
function cmapYigish(oqimlar: string[]): Map<string, string> {
  const m = new Map<string, string>();
  const u = (h: string) => { let o = ''; for (let i = 0; i + 4 <= h.length; i += 4) o += String.fromCharCode(parseInt(h.slice(i, i + 4), 16)); return o; };
  for (const t of oqimlar) {
    if (!t.includes('begincmap')) continue;
    for (const blok of t.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
      for (const r of blok[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) { const k = r[1].toUpperCase(); if (!m.has(k)) m.set(k, u(r[2])); }
    }
    for (const blok of t.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
      for (const r of blok[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(?:<([0-9A-Fa-f]+)>|\[([^\]]*)\])/g)) {
        const a = parseInt(r[1], 16); const z = parseInt(r[2], 16); const w = r[1].length;
        if (!(z >= a) || z - a > 512) continue;
        if (r[3]) { const b0 = parseInt(r[3], 16); for (let c = a; c <= z; c++) { const k = c.toString(16).toUpperCase().padStart(w, '0'); if (!m.has(k)) m.set(k, String.fromCharCode(b0 + c - a)); } }
        else if (r[4]) { const L = [...r[4].matchAll(/<([0-9A-Fa-f]+)>/g)]; for (let c = a; c <= z && c - a < L.length; c++) { const k = c.toString(16).toUpperCase().padStart(w, '0'); if (!m.has(k)) m.set(k, u(L[c - a][1])); } }
      }
    }
  }
  return m;
}
function pdfLiteral(s: string): string {
  return s.replace(/\\(\r\n|\n|\r)/g, '').replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_, c: string) => {
    if (/^[0-7]/.test(c)) return String.fromCharCode(parseInt(c, 8) & 255);
    return ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' } as Record<string, string>)[c] ?? c;
  });
}
function pdfHex(h: string, cm: Map<string, string>): string {
  const x = h.replace(/\s+/g, '').toUpperCase(); let o = '';
  if (cm.size && x.length % 4 === 0) { for (let i = 0; i < x.length; i += 4) o += cm.get(x.slice(i, i + 4)) ?? String.fromCharCode(parseInt(x.slice(i, i + 4), 16)); return o; }
  for (let i = 0; i + 1 < x.length; i += 2) { const c = x.slice(i, i + 2); o += cm.get(c) ?? String.fromCharCode(parseInt(c, 16)); }
  return o;
}
function pdf(b: Uint8Array): string {
  const oqimlar = pdfOqimlar(b);
  const cm = cmapYigish(oqimlar);
  let out = '';
  const TOK = /\[((?:\\[\s\S]|[^\]\\])*)\]\s*TJ|\(((?:\\[\s\S]|[^\\)])*)\)\s*(?:Tj|'|")|<([0-9A-Fa-f\s]+)>\s*Tj|T\*|\bET\b|\bT[dD]\b/g;
  for (const t of oqimlar) {
    if (!/\bBT\b/.test(t)) continue;
    for (const m of t.matchAll(TOK)) {
      if (m[1] !== undefined) {
        for (const p of m[1].matchAll(/\(((?:\\[\s\S]|[^\\)])*)\)|<([0-9A-Fa-f\s]+)>|(-?\d+(?:\.\d+)?)/g)) {
          if (p[1] !== undefined) out += pdfLiteral(p[1]);
          else if (p[2] !== undefined) out += pdfHex(p[2], cm);
          else if (Number(p[3]) < -250) out += ' ';
        }
      } else if (m[2] !== undefined) out += pdfLiteral(m[2]);
      else if (m[3] !== undefined) out += pdfHex(m[3], cm);
      else out += '\n';
    }
    out += '\n';
    if (out.length > MATN_MAX_CHIQISH * 3) break;
  }
  return out;
}

/** Fayldan matn ajratadi. Qaytadi: bo'sh satr = ajratib bo'lmadi/foydali matn yo'q. Hech qachon xato tashlamaydi. */
export function matnAjrat(nom: string, mime: string, bayt: Uint8Array): string {
  try {
    if (!bayt.byteLength || bayt.byteLength > MATN_MAX_KIRISH) return '';
    let t = '';
    if (/\.docx$/i.test(nom)) t = docx(bayt);
    else if (/\.xlsx$/i.test(nom)) t = xlsx(bayt);
    else if (/\.pptx$/i.test(nom)) t = pptx(bayt);
    else if (/\.pdf$/i.test(nom) || /^application\/pdf$/i.test(mime)) t = pdf(bayt);
    else if (MATN_KENGAYTMA.test(nom) || /^text\//i.test(mime)) t = new TextDecoder('utf-8', { fatal: false, ignoreBOM: false }).decode(bayt.subarray(0, MATN_MAX_CHIQISH * 2));
    else return '';
    // boshqaruv belgilari -> bo'sh joy, takroriy bo'shliqlar siqiladi
    // eslint-disable-next-line no-control-regex
    t = t.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f�]+/g, ' ').replace(/[ \t ]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
    if (t.length > MATN_MAX_CHIQISH) t = t.slice(0, MATN_MAX_CHIQISH);
    // foydali matn bormi: kamida 20 ta harf/raqam
    return (t.match(/[\p{L}\p{N}]/gu)?.length ?? 0) >= 20 ? t : '';
  } catch { return ''; }
}

/** Natija parchasi: birinchi mos so'z atrofidagi ~160 belgi (matn R2 dan olinadi, faqat eng yaxshi natijalar uchun). */
export function parchaTop(matn: string, sozlar: string[]): string | null {
  if (!matn || !sozlar.length) return null;
  const kichik = matn.toLowerCase();
  let eng = -1;
  for (const w of sozlar) { const i = kichik.indexOf(w); if (i >= 0 && (eng < 0 || i < eng)) eng = i; }
  if (eng < 0) {
    // kirill/lotin farqi: normalizatsiyalangan matndan qidirib bo'lmaydi (pozitsiya mos kelmaydi) - boshidan qisqa parcha
    return matn.slice(0, 160).replace(/\s+/g, ' ').trim() || null;
  }
  const a = Math.max(0, eng - 60);
  return (a > 0 ? '…' : '') + matn.slice(a, a + 180).replace(/\s+/g, ' ').trim() + (a + 180 < matn.length ? '…' : '');
}
