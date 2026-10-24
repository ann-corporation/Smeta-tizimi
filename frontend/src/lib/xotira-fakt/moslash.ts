/**
 * «Xotiradan fakt» — matn qatorini obyekt smetasining BARCHA ish/material/uskuna qatorlariga moslash (egasi 2026-10-24).
 *
 * Aniqlagich F2 motorining o'sha primitivlari ustida (normBir, razdel yo'li) — yangi parallel smeta-tushunish yozilmaydi:
 *  - so'zlar: lotin/kirill + o'zbekcha→ruscha lug'at (lugat.ts), qo'shimcha so'zlar tashlanadi, ruscha so'z shakllari (o'zak
 *    bo'yicha: ГЕОМЕМБРАНА ↔ ГЕОМЕМБРАНЫ);
 *  - ball: qamrov (so'rov so'zlarining qanchasi topildi) + aniqlik (smeta nomining qanchasi so'rovda) + birlik + razdel yo'li;
 *  - F2 motori (f2MoslashV3) ham bir marta chaqiriladi: u topgan nomzodlarga qo'shimcha ball (kod/uzun nom bilan aniq);
 *  - hajm BLOKLANMAYDI: qoldiqdan oshsa faqat belgi ('sigadi: false').
 */
import type { T2Qator } from '../../api/supabase';
import { normBir } from '../f2-match-engine';
import { f2MoslashV3, type SmetaQator } from '../f2-moslash-v3';
import type { F2Tugun } from '../smeta-anatomiya/f2';
import { xotiraSozlari } from './lugat';
import type { XotiraQator } from './parse';
import { birlikNorm } from './parse';

export interface XotiraHolat {
  qator_id: number;
  smeta_hajm?: number | null; fakt_hajm?: number | null; f2_hajm?: number | null; smeta_narx?: number | null; f2_narx?: number | null;
}

export interface XotiraNomzod {
  qatorId: number;
  ball: number;
  tur: string;
  kod: string | null;
  nom: string;
  birlik: string | null;
  yol: string;
  smetaHajm: number | null;
  faktHajm: number;
  f2Hajm: number;
  /** Smeta − fakt (bajarilmagan qism). */
  qoldiq: number | null;
  narx: number | null;
  /** So'rov birligi smeta birligiga mosmi (null — so'rovda birlik yo'q). */
  birlikMos: boolean | null;
  /** So'rov miqdori smeta birligida (masalan 120 м3 → 1.2 [100М3]). */
  miqdor: number | null;
  /** Miqdor qoldiqqa sig'adimi (null — noma'lum). Faqat KO'RSATISH: hajm bloklanmaydi. */
  sigadi: boolean | null;
}

export type XotiraHolatTuri = 'aniq' | 'taklif' | 'topilmadi';
export interface XotiraNatija { qator: XotiraQator; holat: XotiraHolatTuri; nomzodlar: XotiraNomzod[] }

interface Satr { q: T2Qator; toklar: string[]; yolToklar: string[]; yol: string; fakt: number; f2: number; smeta: number | null; narx: number | null }
export interface XotiraIndeks { satrlar: Satr[]; smeta: SmetaQator[] }

const MOSLASH_TURLAR = new Set(['bl', 'mat', 'ob']);
const son = (v: unknown): number | null => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));

function oraliqQism(a: string, b: string): number { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i; }
/** Ikki so'z bir xil yoki bir o'zakdan (ruscha qo'shimcha farqi): umumiy prefiks ≥ max(4, qisqasi − 2). */
export function sozMos(a: string, b: string): boolean {
  if (a === b) return true;
  const m = Math.min(a.length, b.length);
  if (m < 4 || /\d/.test(a) || /\d/.test(b)) return false;
  return oraliqQism(a, b) >= Math.max(4, m - 2);
}

const tokenlar = (s: string | null | undefined): string[] => xotiraSozlari(s ?? '');

/** Birlik: «100М3» → { koef: 100, baza: 'М3' }. */
export function birlikTahlil(b: string | null | undefined): { koef: number; baza: string } | null {
  const t = String(b ?? '').trim();
  if (!t) return null;
  const m = /^(\d+(?:[.,]\d+)?)\s*(.*)$/.exec(t);
  const koef = m ? Number(m[1].replace(',', '.')) : 1;
  const baza = normBir(m ? m[2] : t);
  return baza ? { koef: koef > 0 ? koef : 1, baza } : null;
}

export function xotiraIndeks(rows: readonly T2Qator[], states: readonly XotiraHolat[]): XotiraIndeks {
  const st = new Map(states.map((s) => [s.qator_id, s]));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const yolKesh = new Map<number, string>();
  const yolOl = (id: number | null): string => {
    if (id == null) return '';
    const bor = yolKesh.get(id); if (bor != null) return bor;
    const r = byId.get(id); if (!r) return '';
    const o = yolOl(r.ota_id ?? null);
    const v = r.tur === 'rz' ? [o, (r.nom ?? '').replace(/^РАЗДЕЛ:\s*/i, '')].filter(Boolean).join(' › ') : o;
    yolKesh.set(id, v); return v;
  };
  const satrlar: Satr[] = [];
  for (const q of rows) {
    if (!MOSLASH_TURLAR.has(q.tur ?? '')) continue;
    const h = st.get(q.id);
    const yol = yolOl(q.ota_id ?? null);
    satrlar.push({ q, toklar: tokenlar(`${q.nom ?? ''}`), yolToklar: tokenlar(yol), yol, fakt: son(h?.fakt_hajm) ?? 0, f2: son(h?.f2_hajm) ?? 0,
      smeta: son(h?.smeta_hajm) ?? son(q.hajm), narx: son(h?.f2_narx) ?? son(h?.smeta_narx) ?? son(q.narx) });
  }
  const smeta: SmetaQator[] = rows.map((q) => ({ id: q.id, otaId: q.ota_id, tur: q.tur ?? 'rs', kod: q.kod, nom: q.nom, birlik: q.birlik, hajm: q.hajm, narx: q.narx,
    norma: (q as T2Qator & { norma?: number | null }).norma ?? null, tartib: q.tartib }));
  return { satrlar, smeta };
}

function nomzodQur(s: Satr, ball: number, birlik: string | null, miqdor: number | null): XotiraNomzod {
  const so = birlikTahlil(birlik), sm = birlikTahlil(s.q.birlik);
  const birlikMos = so && sm ? so.baza === sm.baza : null;
  const miq = miqdor == null ? null : so && sm && so.baza === sm.baza ? miqdor / sm.koef * so.koef : miqdor;
  const qoldiq = s.smeta == null ? null : s.smeta - s.fakt;
  const sigadi = miq == null || qoldiq == null || birlikMos === false ? null : (qoldiq >= 0 ? miq <= qoldiq * 1.001 + 1e-9 : miq >= qoldiq * 1.001 - 1e-9);
  return { qatorId: s.q.id, ball, tur: s.q.tur ?? 'bl', kod: s.q.kod, nom: s.q.nom ?? '', birlik: s.q.birlik, yol: s.yol, smetaHajm: s.smeta, faktHajm: s.fakt, f2Hajm: s.f2,
    qoldiq, narx: s.narx, birlikMos, miqdor: miq, sigadi };
}

/** So'rov so'zlari bilan smeta qatorini baholash (0..100). */
function ballHisobla(sor: readonly string[], s: Satr, birlik: string | null): number {
  if (!sor.length || !s.toklar.length) return 0;
  const ishlatilgan = new Set<number>();
  let topildi = 0, yolTopildi = 0;
  for (const w of sor) {
    const i = s.toklar.findIndex((t, k) => !ishlatilgan.has(k) && sozMos(w, t));
    if (i >= 0) { ishlatilgan.add(i); topildi++; } else if (s.yolToklar.some((t) => sozMos(w, t))) yolTopildi++;
  }
  if (!topildi && !yolTopildi) return 0;
  const qamrov = (topildi + 0.6 * yolTopildi) / sor.length;
  const aniqlik = topildi / s.toklar.length;
  const so = birlikTahlil(birlik), sm = birlikTahlil(s.q.birlik);
  const bir = so && sm ? (so.baza === sm.baza ? 10 : -15) : 0;
  const tur = s.q.tur === 'bl' ? 4 : 2;
  return Math.max(0, Math.round(62 * Math.min(1, qamrov) + 24 * aniqlik + bir + tur));
}

const REJA_CHEGARA = { aniq: 78, taklif: 38, korsat: 22 };

function tartibla(ind: XotiraIndeks, sor: readonly string[], birlik: string | null, miqdor: number | null, bonus: ReadonlyMap<number, number>, limit: number): XotiraNomzod[] {
  const out: XotiraNomzod[] = [];
  for (const s of ind.satrlar) {
    const b = ballHisobla(sor, s, birlik) + (bonus.get(s.q.id) ?? 0);
    if (b >= REJA_CHEGARA.korsat) out.push(nomzodQur(s, Math.min(100, b), birlik, miqdor));
  }
  out.sort((a, b) => b.ball - a.ball || (a.nom.length - b.nom.length));
  return out.slice(0, limit);
}

/** F2 motoridan bonus: motor topgan nomzodlar (kod/uzun nom bilan) — qo'shimcha ball. */
function motorBonusi(qatorlar: readonly XotiraQator[], ind: XotiraIndeks): Map<number, Map<number, number>> {
  const out = new Map<number, Map<number, number>>();
  try {
    const f2: F2Tugun[] = qatorlar.map((q) => ({ uid: 'X!' + q.id, tur: 'bl', kod: null, nom: q.nom.toUpperCase(), birlik: q.birlik, hajm: q.turi === 'son' ? q.qiymat : null,
      narx: null, summa: null, manzil: { fayl: 'xotira', varaq: 'xotira', qator: q.id }, yol: [], bolalar: [], barg: true }));
    const n = f2MoslashV3(f2, ind.smeta);
    for (const q of qatorlar) {
      const r = n.natijalar.get('X!' + q.id);
      const m = new Map<number, number>();
      if (r?.qatorId != null) m.set(r.qatorId, 25);
      for (const z of r?.nomzodlar ?? []) m.set(z.qatorId, Math.max(m.get(z.qatorId) ?? 0, Math.min(20, Math.round(z.ball / 2))));
      if (m.size) out.set(q.id, m);
    }
  } catch { /* motor yiqilsa — faqat matn ballari */ }
  return out;
}

export function xotiraMosla(qatorlar: readonly XotiraQator[], ind: XotiraIndeks, limit = 5): XotiraNatija[] {
  const bonus = motorBonusi(qatorlar, ind);
  return qatorlar.map((qator) => {
    const sor = tokenlar(qator.nom);
    const birlik = qator.birlik ? birlikNorm(qator.birlik) : null;
    const nz = tartibla(ind, sor, birlik, qator.turi === 'son' ? qator.qiymat : null, bonus.get(qator.id) ?? new Map(), limit);
    const [a, b] = nz;
    const holat: XotiraHolatTuri = !a || a.ball < REJA_CHEGARA.taklif ? 'topilmadi'
      : a.ball >= REJA_CHEGARA.aniq && (!b || a.ball - b.ball >= 12) ? 'aniq' : 'taklif';
    return { qator, holat, nomzodlar: nz };
  });
}

/** Bitta qidiruv maydoni: obyekt smetasining hamma razdellari bo'yicha nom/kod/razdel (miqdorsiz). */
export function xotiraQidiruv(ind: XotiraIndeks, soz: string, limit = 12): XotiraNomzod[] {
  const q = soz.trim();
  if (q.length < 2) return [];
  const kodSoz = q.toUpperCase().replace(/\s+/g, '');
  const kodMos = ind.satrlar.filter((s) => s.q.kod && s.q.kod.toUpperCase().replace(/\s+/g, '').includes(kodSoz));
  const sor = tokenlar(q);
  const nom = tartibla(ind, sor, null, null, new Map(), limit);
  const kodN = kodMos.slice(0, limit).map((s) => nomzodQur(s, 95, null, null));
  const korildi = new Set<number>();
  return [...kodN, ...nom].filter((n) => (korildi.has(n.qatorId) ? false : (korildi.add(n.qatorId), true))).slice(0, limit);
}
