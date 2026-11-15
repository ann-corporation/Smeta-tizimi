/**
 * Offline eval for norm matching + pricing (owner 2026-11-16: "make matching measurably good and PROVE it").
 * Pure metric code. The real approved smetas are read by the LOCAL runner (moslash-eval.local.test.ts) from a folder
 * outside the repository; the repository only carries a tiny synthetic fixture (moslash-eval.test.ts).
 */
import { ishKodKalit, kodKalit, nomKalit } from './resurs-kalit';

/** One approved work line: what the estimator wrote and the norm code he actually used. */
export type IshJuft = { id: string; nom: string; birlik: string | null; hajm: number | null; kod: string; bolim: string[]; fayl: string };
/** One approved resource line. */
export type ResursJuft = { kod: string | null; nom: string; birlik: string | null; narx: number | null; fayl: string };

/** The norm code the estimator used, in canonical form (annotation stripped). */
export const haqiqiyKod = (j: Pick<IshJuft, 'kod'>) => ishKodKalit(j.kod) ?? kodKalit(j.kod);

export type Nomzod = { id: string; kod: string; ishonch?: number };
export type MatcherNatija = { nomzodlar: Nomzod[]; /** Confident auto-selection (null = left to the user / "mos topilmadi"). */ tanlangan: Nomzod | null; ishonch?: number };
export type Matcher = (j: IshJuft) => MatcherNatija;

export type IshMetrika = {
  n: number;
  top1: number; top3: number; top15: number;
  /** Share of lines where the matcher selected automatically. */
  avtoulush: number;
  /** Auto-selected AND correct, as a share of ALL lines (the useful automation). */
  avtoTogri: number;
  /** Precision of the auto-selection: correct / auto-selected. */
  avtoAniqlik: number;
  /** Share of lines answered "not found" (no candidates at all). */
  topilmadi: number;
  ortachaNomzod: number;
  ms: { jami: number; ortacha: number; p95: number };
};

const pct = (x: number) => Math.round(x * 10000) / 10000;

/** Matcher output vs the code the estimator used (compared through the canonical code key). */
export function ishMetrika(juftlar: readonly IshJuft[], matcher: Matcher): IshMetrika {
  let top1 = 0, top3 = 0, top15 = 0, avto = 0, avtoTogri = 0, topilmadi = 0, nomzodSoni = 0;
  const times: number[] = [];
  for (const j of juftlar) {
    const t0 = performance.now();
    const r = matcher(j);
    times.push(performance.now() - t0);
    const want = haqiqiyKod(j);
    const keys = r.nomzodlar.map(n => kodKalit(n.kod));
    nomzodSoni += r.nomzodlar.length;
    if (!r.nomzodlar.length) topilmadi++;
    if (keys[0] === want) top1++;
    if (keys.slice(0, 3).includes(want)) top3++;
    if (keys.slice(0, 15).includes(want)) top15++;
    if (r.tanlangan) { avto++; if (kodKalit(r.tanlangan.kod) === want) avtoTogri++; }
  }
  const n = Math.max(1, juftlar.length);
  const sorted = [...times].sort((a, b) => a - b);
  const jami = times.reduce((a, b) => a + b, 0);
  return { n: juftlar.length, top1: pct(top1 / n), top3: pct(top3 / n), top15: pct(top15 / n),
    avtoulush: pct(avto / n), avtoTogri: pct(avtoTogri / n), avtoAniqlik: avto ? pct(avtoTogri / avto) : 0, topilmadi: pct(topilmadi / n),
    ortachaNomzod: Math.round(nomzodSoni / n * 100) / 100,
    ms: { jami: Math.round(jami), ortacha: Math.round(jami / n * 100) / 100, p95: Math.round((sorted[Math.floor(sorted.length * 0.95)] ?? 0) * 100) / 100 } };
}

/** Distinct (code, name) pairs: the same line repeated in several sheets is counted once. */
export function takrorsiz<T extends Pick<IshJuft, 'kod' | 'nom'>>(juftlar: readonly T[]): T[] {
  const seen = new Set<string>(), out: T[] = [];
  for (const j of juftlar) {
    const k = `${haqiqiyKod(j)}|${nomKalit(j.nom)}`;
    if (seen.has(k)) continue;
    seen.add(k); out.push(j);
  }
  return out;
}

/** Dataset split by FILE (never inside one smeta) so calibration cannot leak the answer. */
export function fayl2bolak<T extends Pick<IshJuft, 'fayl'>>(juftlar: readonly T[]): { train: T[]; test: T[] } {
  const files = [...new Set(juftlar.map(j => j.fayl))].sort();
  const train = new Set(files.filter((_, i) => i % 2 === 0));
  return { train: juftlar.filter(j => train.has(j.fayl)), test: juftlar.filter(j => !train.has(j.fayl)) };
}
