/**
 * tahlil.ts — sahifa darajasidagi oqim: varaq belgisi (shtamp), revizya raqami, profil tanlash, dublikat varaqlar, «AI bilan o'qish» taklifi.
 * Hammasi toza funksiyalar (pdf.js dan ajratilgan) — sintetik fixturalar bilan sinaladi.
 */
import { qatorlarYig, type MatnBo } from './jadval';
import { PROFILLAR, profilBilanOqi, profilSahifagaMos, type Element, type Profil, type Tur } from './profil';
import { satrdanOqi } from './satr';

const BELGI_PREFIKS = ['КЖ', 'КР', 'КМ', 'КД', 'АР', 'АС', 'ГП', 'ЭО', 'ЭМ', 'ЭС', 'ВК', 'ОВ', 'ТХ', 'СС', 'ПБ', 'ТС', 'АУПТ', 'ПОС'];
const LATIN_KIRILL: Record<string, string> = { K: 'К', P: 'Р', R: 'Р', A: 'А', E: 'Э', O: 'О', B: 'В', C: 'С', M: 'М', X: 'Х', T: 'Т', H: 'Н', J: 'Ж' };

/** «kr 5» / «КР-5» / «KR-5.1» -> «КР-5» (kirill, bosh harf, tire); varaq belgisini yagona kalitga keltiradi. */
export function varaqKalit(s: string): string {
  const t = s.toUpperCase().trim().replace(/^([A-ZА-Я]{1,4})[\s_./-]*(?=\d)/, '$1-').replace(/\s+/g, '');
  const m = /^([A-ZА-Я]{1,4})-?(\d+(?:[.,]\d+)?)/.exec(t);
  if (!m) return t;
  const pre = [...m[1]].map((c) => LATIN_KIRILL[c] ?? c).join('');
  return `${pre}-${m[2].replace(',', '.')}`;
}

const BELGI_RE = new RegExp(`(?:^|[^A-Za-zА-Яа-я])((?:${BELGI_PREFIKS.join('|')}|KJ|KR|KM|AR|AS)[-\\s]?\\d+(?:[.,]\\d+)?)(?![0-9A-Za-zА-Яа-я])`, 'gi');

const PREFIKS_RE = new RegExp(`^(${BELGI_PREFIKS.join('|')}|KJ|KR|KM|AR|AS)$`, 'i');

/** Shtamp: «Лист» katagi, uning ostidagi raqam va yuqoridagi/yonidagi prefiks («КР») -> «КР-5». Smeta bo'lim nomlaridagi belgi shu shaklda. */
export function shtampBelgisi(items: MatnBo[]): string | null {
  const list = items.filter((i) => /^Лист$/i.test(i.s.trim()));
  let eng: { d: number; v: string } | null = null;
  for (const l of list) {
    const raqam = items.filter((i) => /^\d{1,3}$/.test(i.s.trim()) && i.y - l.y > 3 && i.y - l.y < 45 && Math.abs(i.x + i.w / 2 - (l.x + l.w / 2)) < 40)
      .sort((a, b) => a.y - b.y)[0];
    if (!raqam) continue;
    const pre = items.filter((i) => PREFIKS_RE.test(i.s.trim()) && l.y - i.y > -5 && l.y - i.y < 160 && Math.abs(i.x - l.x) < 220)
      .sort((a, b) => Math.abs(l.y - a.y) + Math.abs(l.x - a.x) - (Math.abs(l.y - b.y) + Math.abs(l.x - b.x)))[0];
    if (!pre) continue;
    const v = varaqKalit(`${pre.s.trim()}-${raqam.s.trim()}`);
    const d = Math.abs(l.y - pre.y) + Math.abs(l.x - pre.x);
    if (!eng || d < eng.d) eng = { d, v };
  }
  return eng ? eng.v : null;
}

/** Sahifadagi varaq belgisi: avval shtamp («Лист» + prefiks), aks holda matndagi belgi (shtamp zonasi ustun). Aniqlanmasa null. */
export function varaqBelgisi(items: MatnBo[], sahifaBalandligi = 842): string | null {
  const st = shtampBelgisi(items);
  if (st) return st;
  const hisob = new Map<string, number>();
  const qosh = (s: string, w: number) => { const k = varaqKalit(s); hisob.set(k, (hisob.get(k) ?? 0) + w); };
  for (const it of items) {
    const shtamp = it.y > sahifaBalandligi * 0.7;
    for (const m of it.s.matchAll(BELGI_RE)) qosh(m[1], shtamp ? 3 : 1);
  }
  let eng: string | null = null; let b = 0;
  for (const [k, v] of hisob) if (v > b) { b = v; eng = k; }
  return eng;
}
/** Revizya raqami: «Изм. 2», «Ред.3», «Rev 1»; topilmasa null. Eng kattasi olinadi. */
export function revizyaTop(items: MatnBo[]): number | null {
  let eng: number | null = null;
  for (const it of items) {
    for (const m of it.s.matchAll(/(?:изм(?:\.|енение)?|ред(?:\.|акция)?|rev(?:\.|ision)?)\s*[№#:]?\s*(\d{1,2})(?![0-9])/gi)) {
      const n = Number(m[1]); if (eng == null || n > eng) eng = n;
    }
  }
  return eng;
}

export type SahifaNatija = {
  sahifa: number;
  varaq: string | null;
  revizya: number | null;
  profil: string | null;
  elementlar: Element[];
  /** Qoida o'qiy olmadi yoki ishonch past: «AI bilan o'qish» taklif qilinadi (narx oldindan ko'rsatiladi). */
  aiTaklifi: boolean;
  sabab: 'profil_yoq' | 'element_yoq' | 'ishonch_past' | 'tekst_yoq' | 'jadval_yoq' | null;
};

const matnQoshib = (items: MatnBo[]) => items.map((i) => i.s).join(' ');

/** Turni nomdan tuzatadi (spetsifikatsiya jadvalida beton/eshik/pardoz ishlari aralash kelishi mumkin). */
export function turNomdan(nom: string, joriy: Tur): Tur {
  if (joriy !== 'boshqa') return joriy;
  const t = nom.toLowerCase();
  if (/двер|окн|окон|витраж|eshik|deraza/.test(t)) return 'eshik_oyna';
  if (/арматур|сетк/.test(t)) return 'armatura';
  if (/штукатур|окраск|облицов|покрас|шпатл|плитк|обои/.test(t)) return 'pardoz';
  if (/бетон|плита|колонн|балк|ригел|фундамент/.test(t)) return 'beton';
  return 'boshqa';
}

/** Bitta sahifa: profillarni tartib bilan sinaydi, birinchi element bergan profilni oladi. */
export function sahifaniTahlilQil(items: MatnBo[], sahifa: number, profillar: Profil[] = PROFILLAR): SahifaNatija {
  const bo = items.filter((i) => i.sahifa === sahifa);
  const asos = { sahifa, varaq: varaqBelgisi(bo), revizya: revizyaTop(bo), profil: null as string | null, elementlar: [] as Element[] };
  if (bo.filter((i) => i.s.trim()).length < 8) return { ...asos, aiTaklifi: true, sabab: 'tekst_yoq' };
  const qatorlar = qatorlarYig(bo);
  const matn = matnQoshib(bo);
  let sarlavhaTopildi = false;
  const satr = satrdanOqi(qatorlar, undefined, bo).map((e) => ({ ...e }));
    if (satr.length > 0) {
    const o = satr.reduce((a, e) => a + e.ishonch, 0) / satr.length;
    return { ...asos, profil: 'satr', elementlar: satr, aiTaklifi: false, sabab: o < 0.55 ? 'ishonch_past' : null };
  }
  for (const p of profillar) {
    if (!profilSahifagaMos(p, matn, asos.varaq)) continue;
    const r = profilBilanOqi(p, qatorlar);
    if (!r) continue;
    sarlavhaTopildi = true;
    if (r.elementlar.length === 0) continue;
    const elementlar = r.elementlar.map((e) => ({ ...e, tur: turNomdan(e.nom, e.tur) }));
    const o = elementlar.reduce((a, e) => a + e.ishonch, 0) / elementlar.length;
    return { ...asos, profil: p.id, elementlar, aiTaklifi: o < 0.55, sabab: o < 0.55 ? 'ishonch_past' : null };
  }
  // Jadvalga o'xshamaydigan sahifa (reja, kesim): AI taklif qilinmaydi — kalit so'z (spetsifikatsiya/ведомость/экспликация) bo'lsa gina.
  if (!sarlavhaTopildi && !/спецификаци|ведомост|экспликаци|specifik/i.test(matn)) return { ...asos, aiTaklifi: false, sabab: 'jadval_yoq' };
  return { ...asos, aiTaklifi: true, sabab: sarlavhaTopildi ? 'element_yoq' : 'profil_yoq' };
}

/** Fayl(lar)dagi sahifalarni tahlil qiladi. */
export function hujjatniTahlilQil(items: MatnBo[], profillar: Profil[] = PROFILLAR): SahifaNatija[] {
  const sahifalar = [...new Set(items.map((i) => i.sahifa))].sort((a, b) => a - b);
  return sahifalar.map((s) => sahifaniTahlilQil(items, s, profillar));
}

/** Bir varaqning bir necha nusxasi (turli revizya/fayl): eng yuqori revizya tanlanadi, teng bo'lsa keyingisi. Qolganlari `almashgan`. */
export function dublikatTanla<T extends { varaq: string | null; revizya: number | null }>(sahifalar: T[]): { tanlangan: T[]; almashgan: T[] } {
  const guruh = new Map<string, T[]>();
  const belgisiz: T[] = [];
  for (const s of sahifalar) {
    if (!s.varaq) { belgisiz.push(s); continue; }
    const g = guruh.get(s.varaq) ?? []; g.push(s); guruh.set(s.varaq, g);
  }
  const tanlangan: T[] = [...belgisiz]; const almashgan: T[] = [];
  for (const g of guruh.values()) {
    let eng = g[0]; let engIdx = 0;
    g.forEach((s, i) => { if ((s.revizya ?? -1) >= (eng.revizya ?? -1)) { eng = s; engIdx = i; } });
    g.forEach((s, i) => (i === engIdx ? tanlangan.push(s) : almashgan.push(s)));
  }
  return { tanlangan, almashgan };
}

/** AI bilan o'qish narxini oldindan ko'rsatish uchun (har sahifa bitta so'rov). Keshda bor sahifalar bepul. */
export function aiNarxiTaxmini(sahifalar: SahifaNatija[], keshda: ReadonlySet<string>, tokenNarxi: number, fayl: string): { sahifalar: number; bepul: number; token: number | null } {
  const kerak = sahifalar.filter((s) => s.aiTaklifi);
  const bepul = kerak.filter((s) => keshda.has(`${fayl}:${s.sahifa}`)).length;
  const pullik = kerak.length - bepul;
  return { sahifalar: kerak.length, bepul, token: Number.isFinite(tokenNarxi) ? pullik * tokenNarxi : null };
}
