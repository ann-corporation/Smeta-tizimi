/**
 * QURILISH LUG'ATI API (egasi: smeta ↔ oddiy til). Sof funksiyalar, AI yo'q, tasodif yo'q: bir xil kirish — bir xil natija.
 *  - lugatTop(matn)      → kanonik kalitlar (eng mos tepada): «g'isht terish» → ['gisht', …]
 *  - odamNomi(qator, til) → qisqa odam nomi: «Устройство … кладка … толщиной 20 мм» → «G'isht terish, 20 mm»
 *  - lugatKengaytir(soz)  → shu so'zga mos ruscha smeta o'zaklari (qidiruv kengaytmasi): «g'isht» → КИРПИЧ, КЛАДК, КЛАДОЧ
 *  - birlikOdam(birlik)   → «100 м2» → «100 kvadrat»
 *  - lugatOrnat(qiymat)   → kompaniya qo'shimchalari (t2_lugat_kompaniya, ≤ 20 KB)
 * Ishlatiladi: universal qidiruv, fakt/F2 qidiruvi, Jarvis (buyruq satri), usta mobil yorliqlari, naryad hujjati.
 */
import { BIRLIK_LUGAT, LUGAT, type LugatYozuv } from './data';

export type Til = 'uz' | 'uzKir' | 'ru';
export type LugatQoshimcha = {
  /** Kompaniya so'zi → kanonik kalit (masalan «kirpich» → gisht). Yangi kalit bo'lsa — yangi tushuncha yaratiladi. */
  sinonim?: Array<{ kalit: string; soz: string }>;
  /** Kanonik kalit uchun kompaniyaning o'z qisqa nomi. */
  nomlar?: Array<{ kalit: string; uz?: string; ru?: string }>;
};

const APOS = /[ʻʼ’‘`´']/g;

/** Taqqoslash uchun: kichik harf, apostrofsiz, ё=е, o'zbek kirill harflari asosiy harfga (ғ→г, ў→у, қ→к, ҳ→х). */
export const lugatFold = (s: string): string =>
  s.toLowerCase().replace(APOS, '').replace(/ё/g, 'е').replace(/ғ/g, 'г').replace(/ў/g, 'у').replace(/қ/g, 'к').replace(/ҳ/g, 'х');

const RU_LAT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya',
};
const ruLotin = (s: string) => [...s].map((c) => RU_LAT[c] ?? c).join('');

const KIR_IKKI: ReadonlyArray<[string, string]> = [["o'", 'ў'], ["g'", 'ғ'], ['sh', 'ш'], ['ch', 'ч'], ['yo', 'ё'], ['yu', 'ю'], ['ya', 'я'], ['ye', 'е'], ['ts', 'ц'], ['ng', 'нг']];
const KIR_BIR: Record<string, string> = {
  a: 'а', b: 'б', d: 'д', e: 'е', f: 'ф', g: 'г', h: 'ҳ', i: 'и', j: 'ж', k: 'к', l: 'л', m: 'м', n: 'н', o: 'о', p: 'п', q: 'қ', r: 'р',
  s: 'с', t: 'т', u: 'у', v: 'в', x: 'х', y: 'й', z: 'з', c: 'с', w: 'в',
};

/** O'zbekcha lotin → kirill (ғ, ў, қ, ҳ bilan). Bosh harf saqlanadi. */
export function uzKirill(s: string): string {
  const t = s.replace(/[ʻʼ’‘`´]/g, "'");
  let out = ''; let soz0 = true;
  for (let i = 0; i < t.length;) {
    const low = t.slice(i, i + 2).toLowerCase();
    const ikki = KIR_IKKI.find(([l]) => l === low);
    const asl = ikki ? t.slice(i, i + 2) : t[i];
    const katta = asl !== asl.toLowerCase();
    const hammaKatta = asl.length > 1 && asl === asl.toUpperCase();
    let p: string;
    if (ikki) { p = ikki[1]; i += 2; }
    else {
      const c = t[i].toLowerCase();
      p = c === 'e' && soz0 ? 'э' : KIR_BIR[c] ?? (c === "'" ? '' : t[i]);
      i += 1;
    }
    out += hammaKatta ? p.toUpperCase() : katta ? p.charAt(0).toUpperCase() + p.slice(1) : p;
    soz0 = !/[a-zа-я]/i.test(asl);
  }
  return out;
}

type Term = { t: string; ex: boolean };
type Tushuncha = { k: string; qisqa: [string, string]; terms: Term[]; ruTermlar: string[] };

/** Iboralardagi umumiy fe'llar — alohida so'z sifatida tushunchani «tortmasin» (quyish: pol ham, beton ham). */
const UMUMIY_SOZ = new Set(['quyish', 'yotqizish', 'tayyorlash', 'toqish', 'boglash', 'qilish', 'taminoti']);

function sozlarga(s: string): string[] { return lugatFold(s).split(/[^a-zа-я0-9]+/).filter(Boolean); }

function tushunchaQur(y: LugatYozuv, qosh: string[], qisqa?: { uz?: string; ru?: string }): Tushuncha {
  const terms = new Map<string, boolean>();
  const ruTermlar: string[] = [];
  const qo = (t: string, ex: boolean) => { if (t.length >= (ex ? 2 : 3)) { if (!terms.has(t) || ex === false) terms.set(t, ex); } };
  for (const r of y.ru) {
    const ex = r.endsWith('$'); const b = lugatFold(r.replace('$', ''));
    qo(b, ex); qo(ruLotin(b), ex);
    if (!ex && b.length >= 4) ruTermlar.push(b);
  }
  const uzSozlar = (u: string) => {
    for (const variant of [u, uzKirill(u)]) {
      const w = sozlarga(variant);
      if (w.length === 1) qo(w[0], w[0].length <= 3);
      else for (const x of w) { if (x.length >= 4 && !UMUMIY_SOZ.has(x)) qo(x, false); else if (x.length === 3) qo(x, true); }
    }
  };
  for (const u of y.uz) uzSozlar(u);
  for (const s of qosh) for (const w of sozlarga(s)) qo(w, false);
  return { k: y.k, qisqa: [qisqa?.uz ?? y.qisqa[0], qisqa?.ru ?? y.qisqa[1]], terms: [...terms].map(([t, ex]) => ({ t, ex })), ruTermlar };
}

let INDEKS: Tushuncha[] = [];
function indeksQur(q: LugatQoshimcha | null): Tushuncha[] {
  const qosh = new Map<string, string[]>();
  for (const s of q?.sinonim ?? []) { const k = String(s.kalit ?? '').trim(); const z = String(s.soz ?? '').trim(); if (k && z) qosh.set(k, [...(qosh.get(k) ?? []), z]); }
  const nom = new Map<string, { uz?: string; ru?: string }>();
  for (const n of q?.nomlar ?? []) if (n.kalit) nom.set(String(n.kalit), { uz: n.uz?.trim() || undefined, ru: n.ru?.trim() || undefined });
  const out = LUGAT.map((y) => tushunchaQur(y, qosh.get(y.k) ?? [], nom.get(y.k)));
  const bor = new Set(LUGAT.map((y) => y.k));
  for (const [k, soz] of qosh) if (!bor.has(k)) out.push(tushunchaQur({ k, ru: [], uz: [], qisqa: [nom.get(k)?.uz ?? k, nom.get(k)?.ru ?? k] }, soz));
  return out;
}
INDEKS = indeksQur(null);

/** Kompaniya qo'shimchalarini ulaydi (null — faqat umumiy lug'at). Katta/noto'g'ri kirish tashlanadi (≤ 300 yozuv). */
export function lugatOrnat(q: LugatQoshimcha | null): void {
  const toza: LugatQoshimcha | null = q && typeof q === 'object' ? {
    sinonim: Array.isArray(q.sinonim) ? q.sinonim.filter((x) => x && typeof x.kalit === 'string' && typeof x.soz === 'string').slice(0, 300) : [],
    nomlar: Array.isArray(q.nomlar) ? q.nomlar.filter((x) => x && typeof x.kalit === 'string').slice(0, 300) : [],
  } : null;
  INDEKS = indeksQur(toza);
}

const tokenMos = (tok: string, x: Term): boolean => (x.ex ? tok === x.t : tok.startsWith(x.t) || (tok.length >= 4 && x.t.startsWith(tok)));

type Ball = { t: Tushuncha; ball: number; birinchi: number };
function balla(matn: string): Ball[] {
  const toks = [...new Set(sozlarga(matn))];
  const hisob: Ball[] = [];
  for (const t of INDEKS) {
    let ball = 0; let birinchi = Infinity;
    toks.forEach((tok, i) => { if (tok.length >= 2 && t.terms.some((x) => tokenMos(tok, x))) { ball++; birinchi = Math.min(birinchi, i); } });
    if (ball > 0) hisob.push({ t, ball, birinchi });
  }
  return hisob.sort((a, b) => b.ball - a.ball || a.birinchi - b.birinchi);
}

/** Matn → kanonik kalitlar (eng mos tepada). Bo'sh/mos yo'q — []. */
export function lugatTop(matn: string, limit = 5): string[] {
  return balla(matn ?? '').slice(0, Math.max(1, limit)).map((x) => x.t.k);
}

/** Bitta so'z uchun ruscha smeta o'zaklari (BOSH HARF, qidiruvga): «g'isht» → КИРПИЧ, КЛАДК, КЛАДОЧ. Mos yo'q — []. */
export function lugatKengaytir(soz: string): string[] {
  const tok = lugatFold(soz ?? '').trim();
  if (tok.length < 3) return [];
  const out = new Set<string>();
  for (const t of INDEKS) if (t.terms.some((x) => tokenMos(tok, x))) for (const r of t.ruTermlar) out.add(r.toUpperCase());
  return [...out];
}

const kapital = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Tushuncha qisqa nomi (kalit bo'yicha), tilda. */
export function qisqaNom(kalit: string, til: Til = 'uz'): string | null {
  const t = INDEKS.find((x) => x.k === kalit);
  if (!t) return null;
  return til === 'ru' ? t.qisqa[1] : til === 'uzKir' ? uzKirill(t.qisqa[0]) : t.qisqa[0];
}

const SON = '(\\d+(?:[.,]\\d+)?)';
const DIAMETR = new RegExp(`диаметр[а-яё]*\\s*(?:до|свыше|более|менее)?\\s*${SON}\\s*мм`, 'i');
const QALINLIK = new RegExp(`толщин[а-яё]*\\s*(?:до|свыше|более)?\\s*${SON}\\s*мм`, 'i');

/** Qisqartirilgan asl nom (tushuncha topilmasa): birinchi band, ≤ 60 belgi. */
function qisqartir(nom: string): string {
  const b = nom.replace(/\s+/g, ' ').trim().split(/[,;(]| при | с учетом | на высот/)[0].trim();
  const s = b.length > 60 ? b.slice(0, 57).trimEnd() + '…' : b;
  return kapital(s.toLowerCase());
}

/** Smeta qatori → qisqa odam nomi. Tushuncha topilsa lug'atdagi nom + diametr/qalinlik; aks holda qisqartirilgan asl nom. */
export function odamNomi(qator: { nom?: string | null; birlik?: string | null }, til: Til = 'uz'): string {
  const nom = (qator?.nom ?? '').trim();
  if (!nom) return '';
  const top = balla(nom)[0];
  if (!top) return qisqartir(nom);
  const asos = til === 'ru' ? top.t.qisqa[1] : top.t.qisqa[0];
  const d = DIAMETR.exec(nom); const q = QALINLIK.exec(nom);
  const tafsilot: string[] = [];
  if (d) tafsilot.push(`Ø${d[1].replace(',', '.')} ${til === 'ru' ? 'мм' : 'mm'}`);
  if (q) tafsilot.push(`${til === 'ru' ? 'толщ.' : 'qalinligi'} ${q[1].replace(',', '.')} ${til === 'ru' ? 'мм' : 'mm'}`);
  const s = [asos, ...tafsilot].join(', ');
  return til === 'uzKir' ? uzKirill(s) : s;
}

/** Birlik oddiy tilda: «100 м2» → «100 kvadrat»; «м3» → «kub»; «чел-ч» → «odam-soat». Tanilmasa — asl matn. */
export function birlikOdam(birlik: string | null | undefined, til: Til = 'uz'): string {
  const xom = (birlik ?? '').trim();
  if (!xom) return '';
  const m = /^(\d+(?:[.,]\d+)?)?\s*(.+)$/.exec(xom.toLowerCase().replace(/\s+/g, ' '));
  if (!m) return xom;
  const asos = m[2].replace(/[\s.]/g, '');
  const b = BIRLIK_LUGAT.find((x) => x.re.test(asos));
  if (!b) return xom;
  const so = til === 'ru' ? b.ru : til === 'uzKir' ? uzKirill(b.uz) : b.uz;
  return m[1] ? `${m[1]} ${so}` : so;
}

/** Jarvis uchun: matn nimani anglatadi (kanonik tushunchalar, qisqa nomlar, qidiriladigan smeta o'zaklari). */
export function lugatTushuntir(matn: string, limit = 4): string {
  const l = balla(matn ?? '').slice(0, limit);
  if (!l.length) return `«${matn}» lug‘atda topilmadi. Boshqacha so‘z yoki ruscha smeta so‘zini yozing.`;
  return l.map((x) => `«${x.t.qisqa[0]}» / ${x.t.qisqa[1]} [${x.t.k}] — smetada qidiriladigan o‘zaklar: ${x.t.ruTermlar.map((r) => r.toUpperCase()).join(', ') || '—'}`).join('\n');
}

export { LUGAT };
