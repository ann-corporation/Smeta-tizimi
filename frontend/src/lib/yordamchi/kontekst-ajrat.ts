/** Buyruq matnidan obyekt va oy kontekstini ajratadi (uz/ru/en): «Yevropa 1 ning F2 sini och», «oktabr oyi F2». Sof funksiyalar. */
import { sozNorm, sozMosligi } from './matn';

export type ObyektQisqa = { id: number; nom: string };

const OYLAR: ReadonlyArray<readonly string[]> = [
  ['yanvar', 'январ', 'january'], ['fevral', 'феврал', 'february'], ['mart', 'март', 'march'], ['aprel', 'апрел', 'april'],
  ['may', 'май', 'мая'], ['iyun', 'июн', 'june'], ['iyul', 'июл', 'july'], ['avgust', 'август', 'august'],
  ['sentabr', 'сентабр', 'сентябр', 'september'], ['oktabr', 'октабр', 'октябр', 'october'], ['noyabr', 'ноябр', 'november'], ['dekabr', 'декабр', 'december'],
].map((l) => l.map(sozNorm));

const JORIY = ['joriy', 'shu', 'bu', 'текущ', 'this', 'hozirgi'].map(sozNorm);
const OTGAN = ['otgan', 'oldingi', 'avvalgi', 'прошл', 'last', 'previous', 'proshlyi'].map(sozNorm);
const OY_SOZ = ['oy', 'oyi', 'oyning', 'oyda', 'месяц', 'месяца', 'month'].map(sozNorm);

/** Oy nomi: aniq yoki tuslangan shakl («oktabrda»); qisqa ildiz («may», «июн») uchun so'z uzunligi cheklangan (maydon != may). */
const oyMos = (t: string, s: string) => t === s || (t.startsWith(s) && (s.length >= 4 || t.length <= s.length + 2));

const p2 = (n: number) => String(n).padStart(2, '0');

export type OyNatija = { oy: string; ishlatilgan: Set<number> } | null;

/** Oy: «2026-10», «oktabr (2026)», «joriy oy», «o'tgan oy». `bugun` — test uchun. Yil aytilmasa — joriy yil. */
export function oyAjrat(xom: string, tokenlar: readonly string[], bugun: Date = new Date()): OyNatija {
  const ishlatilgan = new Set<number>();
  const m = /\b(20\d{2})[-./](0?[1-9]|1[0-2])\b/.exec(xom);
  if (m) {
    tokenlar.forEach((t, i) => { if (t === m[1] || t === m[2] || t === String(Number(m[2]))) ishlatilgan.add(i); });
    return { oy: `${m[1]}-${p2(Number(m[2]))}`, ishlatilgan };
  }
  const yilIdx = tokenlar.findIndex((t) => /^20\d{2}$/.test(t));
  const yil = yilIdx >= 0 ? Number(tokenlar[yilIdx]) : bugun.getFullYear();
  for (let i = 0; i < tokenlar.length; i++) {
    const oyIdx = OYLAR.findIndex((stems) => stems.some((s) => oyMos(tokenlar[i], s)));
    if (oyIdx < 0) continue;
    ishlatilgan.add(i);
    if (yilIdx >= 0) ishlatilgan.add(yilIdx);
    tokenlar.forEach((t, j) => { if (OY_SOZ.includes(t)) ishlatilgan.add(j); });
    return { oy: `${yil}-${p2(oyIdx + 1)}`, ishlatilgan };
  }
  const oyBor = tokenlar.some((t) => OY_SOZ.includes(t));
  if (oyBor) {
    const idxlar = (royxat: readonly string[]) => tokenlar.flatMap((t, i) => (royxat.some((r) => t === r || (r.length >= 4 && t.startsWith(r))) ? [i] : []));
    const ot = idxlar(OTGAN); const jo = idxlar(JORIY);
    const belgila = (l: number[]) => { l.forEach((i) => ishlatilgan.add(i)); tokenlar.forEach((t, j) => { if (OY_SOZ.includes(t)) ishlatilgan.add(j); }); };
    if (ot.length) { belgila(ot); const d = new Date(bugun.getFullYear(), bugun.getMonth() - 1, 1); return { oy: `${d.getFullYear()}-${p2(d.getMonth() + 1)}`, ishlatilgan }; }
    if (jo.length) { belgila(jo); return { oy: `${bugun.getFullYear()}-${p2(bugun.getMonth() + 1)}`, ishlatilgan }; }
  }
  return null;
}

export type ObyektNatija =
  | { tur: 'aniq'; obyekt: ObyektQisqa; ishlatilgan: Set<number> }
  | { tur: 'noaniq'; nomzodlar: ObyektQisqa[] }
  | null;

/** Obyekt nomining asosiy qismi (qavs/vergul/tiredan oldingi): «Yevropa 1 (Fast Food)» -> «Yevropa 1». */
const yadro = (nom: string) => nom.split(/[(,–—]| - /)[0];
const nomSozlari = (nom: string) => yadro(nom).toLowerCase().replace(/[ʻʼ‘’`´']/g, '').split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(sozNorm);

/** Obyekt: nomining BARCHA asosiy so'zlari so'rovda bo'lsa mos. Ko'p so'zli aniq nom ustun; teng bo'lsa — noaniq. */
export function obyektAjrat(tokenlar: readonly string[], obyektlar: readonly ObyektQisqa[]): ObyektNatija {
  const nomzod: Array<{ o: ObyektQisqa; idx: number[] }> = [];
  for (const o of obyektlar) {
    const ns = nomSozlari(o.nom);
    if (!ns.length || (ns.length === 1 && ns[0].length < 3 && !/\d/.test(ns[0]))) continue;
    const idx: number[] = []; let hammasi = true;
    for (const n of ns) {
      const i = tokenlar.findIndex((q, k) => !idx.includes(k) && sozMosligi(q, n) >= 0.8);
      if (i < 0) { hammasi = false; break; }
      idx.push(i);
    }
    if (hammasi) nomzod.push({ o, idx });
  }
  if (!nomzod.length) return null;
  const eng = Math.max(...nomzod.map((n) => n.idx.length));
  const top = nomzod.filter((n) => n.idx.length === eng);
  if (top.length > 1) return { tur: 'noaniq', nomzodlar: top.slice(0, 5).map((n) => n.o) };
  return { tur: 'aniq', obyekt: top[0].o, ishlatilgan: new Set(top[0].idx) };
}
