/**
 * «Xotiradan fakt» — erkin matnni qatorlarga ajratish (egasi 2026-10-24): har qator bitta ish.
 * «kanal tubiga beton 120 m3», «geomembrana 3500 m2», «poydevor 50%», «armatura hammasi», «120 m3 beton».
 */
export type MiqdorTuri = 'son' | 'foiz' | 'hammasi' | 'yoq';

export interface XotiraQator {
  id: number;
  xom: string;
  /** Miqdor ajratib olingan nom (moslash uchun). */
  nom: string;
  turi: MiqdorTuri;
  /** `son` — hajm; `foiz` — 0..100+; boshqalarda null. */
  qiymat: number | null;
  birlik: string | null;
}

const BIRLIKLAR = '(?:m3|м3|м³|m³|kub|куб|m2|м2|м²|m²|kv|кв|pm|п\\.?\\s?м|kg|кг|tn|тн|t|т|dona|dn|sht|шт|ta|литр|l|л|m|м|komplekt|компл|kompl|к-т|soat|час|маш-?ч|чел-?ч)';
const SON = '[-+]?\\d+(?:[\\s\\u00a0]?\\d{3})*(?:[.,]\\d+)?';
const OXIR = new RegExp(`^(.*?)[\\s:=–-]*(${SON})\\s*(%|${BIRLIKLAR}\\.?)?\\s*$`, 'i');
const BOSH = new RegExp(`^(${SON})\\s*(%|${BIRLIKLAR}\\.?)?\\s+(.+)$`, 'i');
const HAMMASI = /\b(hammasi|barchasi|qoldiq(?:\s+hammasi)?|hamma|все|остаток|весь|all)\b/i;

const sonOqi = (s: string): number => Number(s.replace(/[\s ]/g, '').replace(',', '.'));

/** Birlik matnini smeta uslubiga yaqinlashtiradi: m3 → М3, kv → М2. */
export function birlikNorm(b: string | null): string | null {
  if (!b) return null;
  const t = b.toLowerCase().replace(/[\s.]/g, '');
  if (/^(m3|м3|м³|m³|kub|куб)$/.test(t)) return 'М3';
  if (/^(m2|м2|м²|m²|kv|кв)$/.test(t)) return 'М2';
  if (/^(pm|пм)$/.test(t)) return 'М';
  if (/^(m|м)$/.test(t)) return 'М';
  if (/^(kg|кг)$/.test(t)) return 'КГ';
  if (/^(tn|тн|t|т)$/.test(t)) return 'Т';
  if (/^(dona|dn|sht|шт|ta)$/.test(t)) return 'ШТ';
  if (/^(l|л|литр)$/.test(t)) return 'Л';
  if (/^(komplekt|компл|kompl|к-т|кт)$/.test(t)) return 'КОМПЛ';
  return b.toUpperCase();
}

export function qatorlarniOqi(matn: string): XotiraQator[] {
  const out: XotiraQator[] = [];
  let id = 0;
  for (const xom0 of matn.split(/\r?\n|;/)) {
    const xom = xom0.replace(/^\s*(?:[-*••]|\d{1,3}[.)])\s+/, '').trim();
    if (!xom) continue;
    id += 1;
    if (HAMMASI.test(xom)) {
      out.push({ id, xom, nom: xom.replace(HAMMASI, ' ').replace(/\s+/g, ' ').trim(), turi: 'hammasi', qiymat: null, birlik: null });
      continue;
    }
    let m = OXIR.exec(xom);
    let nom: string, son: string, bir: string | undefined;
    if (m && m[1].trim()) { nom = m[1]; son = m[2]; bir = m[3]; }
    else if ((m = BOSH.exec(xom))) { son = m[1]; bir = m[2]; nom = m[3]; }
    else { out.push({ id, xom, nom: xom, turi: 'yoq', qiymat: null, birlik: null }); continue; }
    const q = sonOqi(son);
    if (!Number.isFinite(q)) { out.push({ id, xom, nom: xom, turi: 'yoq', qiymat: null, birlik: null }); continue; }
    nom = nom.replace(/[\s:=–-]+$/, '').trim();
    if (bir === '%') out.push({ id, xom, nom, turi: 'foiz', qiymat: q, birlik: null });
    else out.push({ id, xom, nom, turi: 'son', qiymat: q, birlik: birlikNorm(bir?.replace(/\.$/, '') ?? null) });
  }
  return out;
}

/** Qidiruvdagi «miqdor» maydoni: «120», «50%», «hammasi». */
export function miqdorOqi(s: string): { turi: MiqdorTuri; qiymat: number | null } {
  const t = s.trim();
  if (!t) return { turi: 'yoq', qiymat: null };
  if (HAMMASI.test(t)) return { turi: 'hammasi', qiymat: null };
  const m = /^(\S+?)\s*(%)?$/.exec(t);
  if (!m) return { turi: 'yoq', qiymat: null };
  const q = sonOqi(m[1]);
  if (!Number.isFinite(q)) return { turi: 'yoq', qiymat: null };
  return m[2] ? { turi: 'foiz', qiymat: q } : { turi: 'son', qiymat: q };
}
