/**
 * lib/imzo/mazmun.ts - hujjatning KANONIK MAZMUNI va uning xeshi (egasi qarori: imzo fayl BAYTLARI emas, mazmun ustidan).
 *
 * Nega: Excel faylni kimdir ochib qayta saqlasa baytlari o'zgaradi (bayt xeshi yolg'on «o'zgargan» berardi); raqam o'zgarsa esa
 * bilinishi SHART. Shuning uchun xlsx dan ko'rinadigan MAZMUN o'qiladi: har varaq (tartib bilan) va undagi bo'sh bo'lmagan har katakning
 * qiymati (matn / son / mantiqiy / xato / formula matni) - kodlari, nomlari, birliklari, hajmlari, narxlari, summalari va jami hammasi shu
 * kataklarda. Stil, kenglik, rasm, zip tuzilishi, sharedStrings tartibi, kolontitul va «IMZO» varag'i xeshga KIRMAYDI.
 * Sonlar 12 ta muhim raqamga normallashtiriladi (Excel qayta saqlaganda float yozuvi o'zgarishi xeshga ta'sir qilmasin).
 * Kanonik JSON deterministik: varaqlar fayldagi tartibda, kataklar (qator, ustun) tartibida.
 *
 * Cheklov (ADR §6): tizimdagi hujjat yozuvi (R2 dagi asl xlsx) himoyalanadi, Excel nusxa - uning ko'rinishi. Hozir mazmun KATAKLARDAN
 * umumiy o'qiladi (hujjat turiga bog'lanmagan); tur bo'yicha tuzilmali (kod/nom/hajm/narx) kanon keyingi bosqich. Tasodifiy o'zgaruvchan
 * formula (NOW(), RAND()) bo'lsa qayta saqlash xeshni o'zgartiradi. xlsx bo'lmagan fayl (PDF, rasm): bayt xeshi.
 */
import { strFromU8, strToU8, unzipSync } from 'fflate';
import { sha256Hex } from './yadro';

/** Imzo varag'ining nomi (hujjat oxirida; mazmun xeshiga kirmaydi). */
export const IMZO_VARAQ_NOMI = 'IMZO';

export type KatakTuri = 's' | 'n' | 'b' | 'e' | 'f';
export type KanonKatak = readonly [ref: string, tur: KatakTuri, qiymat: string];
export type KanonVaraq = { nom: string; kataklar: KanonKatak[] };
export type KanonMazmun = { v: 1; varaqlar: KanonVaraq[] };
export type MazmunFarqi = { varaq: string; katak: string; qator: number; eski: string | null; yangi: string | null };

const ZIP_BOSHI = (b: Uint8Array) => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;

const unEsc = (s: string): string => s.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (_m, e: string) => {
  if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  return ({ lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" } as Record<string, string>)[e];
});
const matnTozala = (s: string) => s.replace(/\r\n?/g, '\n').replace(/_x000D_/g, '').trim();

/** `<t>` lardan matn (rich text qismlari birlashtiriladi; fonetik `rPh` tashlanadi). */
function tMatni(xml: string): string {
  const toza = xml.replace(/<(\w+:)?rPh\b[\s\S]*?<\/(\w+:)?rPh>/g, '');
  let s = '';
  for (const m of toza.matchAll(/<(?:\w+:)?t\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?t>)/g)) s += m[1] ?? '';
  return unEsc(s);
}

function ulashganMatnlar(xml: string | undefined): string[] {
  if (!xml) return [];
  return [...xml.matchAll(/<(?:\w+:)?si\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?si>)/g)].map((m) => matnTozala(tMatni(m[1] ?? '')));
}

const atr = (a: string, nom: string): string | null => new RegExp(`\\b${nom}="([^"]*)"`).exec(a)?.[1] ?? null;

function sonNorm(s: string): string {
  const x = Number(s);
  if (!Number.isFinite(x)) return s.trim();
  if (x === 0) return '0';
  return String(Number(x.toPrecision(12)));
}

function ustunSoni(ref: string): [number, number] {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!m) return [0, 0];
  let c = 0;
  for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64);
  return [Number(m[2]), c];
}

function varaqKataklari(xml: string, ulashgan: string[]): KanonKatak[] {
  const out: KanonKatak[] = [];
  for (const m of xml.matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
    const ref = atr(m[1], 'r'); const ich = m[2];
    if (!ref || !ich) continue;
    const t = atr(m[1], 't');
    const v = /<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/.exec(ich)?.[1];
    const f = /<(?:\w+:)?f\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?f>)/.exec(ich);
    let tur: KatakTuri; let q: string | null = null;
    if (t === 'inlineStr') { tur = 's'; q = matnTozala(tMatni(/<(?:\w+:)?is\b[^>]*>([\s\S]*?)<\/(?:\w+:)?is>/.exec(ich)?.[1] ?? '')); }
    else if (v === undefined) { if (f) { tur = 'f'; q = matnTozala(unEsc(f[1] ?? '')); } else continue; }
    else if (t === 's') { tur = 's'; q = ulashgan[Number(v)] ?? ''; }
    else if (t === 'str') { tur = 's'; q = matnTozala(unEsc(v)); }
    else if (t === 'b') { tur = 'b'; q = v.trim() === '1' ? '1' : '0'; }
    else if (t === 'e') { tur = 'e'; q = matnTozala(unEsc(v)); }
    else { tur = 'n'; q = sonNorm(unEsc(v)); }
    if (q === '' || q === null) continue;
    out.push([ref, tur, q]);
  }
  return out.sort((a, b) => { const [ra, ca] = ustunSoni(a[0]); const [rb, cb] = ustunSoni(b[0]); return ra - rb || ca - cb; });
}

export function xlsxMi(bytes: Uint8Array): boolean {
  if (!ZIP_BOSHI(bytes)) return false;
  try { return 'xl/workbook.xml' in unzipSync(bytes, { filter: (f) => f.name === 'xl/workbook.xml' }); } catch { return false; }
}

/** Faylda «IMZO» varag'i bormi (imzolangan/QR li nusxa). */
export function imzoVaraqiBormi(bytes: Uint8Array): boolean {
  if (!ZIP_BOSHI(bytes)) return false;
  try {
    const f = unzipSync(bytes, { filter: (e) => e.name === 'xl/workbook.xml' });
    return !!f['xl/workbook.xml'] && new RegExp('<(?:\\w+:)?sheet\\b[^>]*\\bname="' + IMZO_VARAQ_NOMI + '"').test(strFromU8(f['xl/workbook.xml']));
  } catch { return false; }
}

/** xlsx kanonik mazmuni (IMZO varag'isiz). xlsx bo'lmasa yoki o'qib bo'lmasa - null. */
export function xlsxKanonik(bytes: Uint8Array): KanonMazmun | null {
  if (!ZIP_BOSHI(bytes)) return null;
  let f: Record<string, Uint8Array>;
  try { f = unzipSync(bytes); } catch { return null; }
  if (!f['xl/workbook.xml']) return null;
  const wb = strFromU8(f['xl/workbook.xml']);
  const rels = new Map<string, string>();
  for (const m of strFromU8(f['xl/_rels/workbook.xml.rels'] ?? new Uint8Array()).matchAll(/<Relationship\b([^>]*?)\/?>/g)) {
    const id = atr(m[1], 'Id'); const tg = atr(m[1], 'Target');
    if (id && tg) rels.set(id, tg.startsWith('/') ? tg.slice(1) : 'xl/' + tg.replace(/^\.\//, ''));
  }
  const ulashgan = ulashganMatnlar(f['xl/sharedStrings.xml'] ? strFromU8(f['xl/sharedStrings.xml']) : undefined);
  const varaqlar: KanonVaraq[] = [];
  for (const m of wb.matchAll(/<(?:\w+:)?sheet\b([^>]*?)\/?>/g)) {
    const nom = atr(m[1], 'name'); const rid = atr(m[1], 'r:id') ?? atr(m[1], 'id');
    if (nom === null || !rid) continue;
    const yol = rels.get(rid);
    const ad = unEsc(nom);
    if (ad === IMZO_VARAQ_NOMI || !yol || !f[yol]) continue;
    varaqlar.push({ nom: ad, kataklar: varaqKataklari(strFromU8(f[yol]), ulashgan) });
  }
  return { v: 1, varaqlar };
}

/** Deterministik kanonik JSON matni. */
export const kanonMatni = (k: KanonMazmun): string => JSON.stringify(k);

/** Hujjat mazmun xeshi (hex): xlsx - kanonik mazmun; boshqa fayl - baytlar. */
export async function hujjatMazmunXeshi(bytes: Uint8Array): Promise<string> {
  const k = xlsxKanonik(bytes);
  if (k) return sha256Hex(strToU8('T2-MAZMUN-V2\n' + kanonMatni(k)));
  return sha256Hex(bytes);
}

/** Ikki mazmun orasidagi farq: qaysi varaq, katak va qator (eski -> yangi). */
export function mazmunFarqi(eski: KanonMazmun, yangi: KanonMazmun, limit = 100): MazmunFarqi[] {
  const out: MazmunFarqi[] = [];
  const nomlar = [...new Set([...eski.varaqlar.map((v) => v.nom), ...yangi.varaqlar.map((v) => v.nom)])];
  for (const nom of nomlar) {
    const a = new Map((eski.varaqlar.find((v) => v.nom === nom)?.kataklar ?? []).map((k) => [k[0], `${k[1]}:${k[2]}`] as const));
    const b = new Map((yangi.varaqlar.find((v) => v.nom === nom)?.kataklar ?? []).map((k) => [k[0], `${k[1]}:${k[2]}`] as const));
    for (const ref of [...new Set([...a.keys(), ...b.keys()])].sort((x, y) => { const [r1, c1] = ustunSoni(x); const [r2, c2] = ustunSoni(y); return r1 - r2 || c1 - c2; })) {
      const x = a.get(ref) ?? null; const y = b.get(ref) ?? null;
      if (x === y) continue;
      out.push({ varaq: nom, katak: ref, qator: ustunSoni(ref)[0], eski: x === null ? null : x.slice(2), yangi: y === null ? null : y.slice(2) });
      if (out.length >= limit) return out;
    }
  }
  return out;
}
