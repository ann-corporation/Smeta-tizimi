/**
 * Uzbek -> Russian term pairs learned from approved smetas (owner: Uzbek wordings must find Russian norm wordings and back).
 *
 * Source: exemplars that carry the SAME norm code but are worded in the two languages. Whatever Uzbek stem keeps showing up
 * on the Uzbek side of several different codes while one Russian word keeps showing up on the Russian side of those same codes is a pair
 * (support = number of distinct codes that back it). Nothing is guessed from a single smeta line: min support 2 codes, and the
 * pair must explain at least half of the Uzbek stem's occurrences. The table holds generic construction words only (stems and words,
 * no sums, no names): it is shared reference knowledge, derived from the exemplars that already passed the layer's own rules.
 */
import { ildiz, sozlar } from './matn-qidiruv';
import { uzbekMi } from './norm-lugat';
import type { KompaktMisol } from './tajriba-indeks';

/** [uzbek stem, russian word (surface form), support in distinct codes] */
export type UzRuJuft = [uz: string, ru: string, support: number];
export type UzRu = { v: 1; juftlar: UzRuJuft[] };

export const UZRU_MIN_SUPPORT = 2;
export const UZRU_MIN_ULUSH = 0.5;
const MAX_RU_PER_UZ = 3;

/** Stems of a text with one surface word per stem (numbers and short noise excluded). */
function stemSozlar(t: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const w of sozlar(t)) { const st = ildiz(w); if (st && !/\d/.test(st) && st.length >= 3 && !out.has(st)) out.set(st, w); }
  return out;
}

export function uzRuOrgan(misollar: readonly KompaktMisol[], minSupport = UZRU_MIN_SUPPORT): UzRu {
  const byCode = new Map<string, { uz: Array<Map<string, string>>; ru: Array<Map<string, string>> }>();
  for (const [t, , kodlar] of misollar) {
    const side = uzbekMi(t) ? 'uz' : 'ru';
    const st = stemSozlar(t);
    if (!st.size) continue;
    for (const [kod] of kodlar) {
      const e = byCode.get(kod) ?? { uz: [], ru: [] };
      byCode.set(kod, e);
      e[side].push(st);
    }
  }
  const uzCodes = new Map<string, number>();                       // uz stem -> codes whose Uzbek side has it
  const co = new Map<string, Map<string, { n: number; surf: Map<string, number> }>>();  // uz stem -> ru stem -> support
  for (const { uz, ru } of byCode.values()) {
    if (!uz.length || !ru.length) continue;
    const uzSet = new Set<string>(), ruSet = new Map<string, string>();
    for (const m of uz) for (const k of m.keys()) uzSet.add(k);
    for (const m of ru) for (const [k, w] of m) if (!ruSet.has(k)) ruSet.set(k, w);
    for (const u of uzSet) {
      if (ruSet.has(u)) continue;                                  // same stem in both languages: nothing to translate
      uzCodes.set(u, (uzCodes.get(u) ?? 0) + 1);
      const row = co.get(u) ?? new Map(); co.set(u, row);
      for (const [r, w] of ruSet) {
        if (uzSet.has(r)) continue;
        const c = row.get(r) ?? { n: 0, surf: new Map() }; row.set(r, c);
        c.n++; c.surf.set(w, (c.surf.get(w) ?? 0) + 1);
      }
    }
  }
  const juftlar: UzRuJuft[] = [];
  for (const [u, row] of co) {
    const jami = uzCodes.get(u) ?? 0;
    const best = [...row.entries()].filter(([, c]) => c.n >= minSupport && c.n / jami >= UZRU_MIN_ULUSH)
      .sort((a, b) => b[1].n - a[1].n || (a[0] < b[0] ? -1 : 1)).slice(0, MAX_RU_PER_UZ);
    for (const [, c] of best) {
      const surf = [...c.surf.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0];
      juftlar.push([u, surf, c.n]);
    }
  }
  juftlar.sort((a, b) => b[2] - a[2] || (a[0] + a[1] < b[0] + b[1] ? -1 : 1));
  return { v: 1, juftlar };
}

/** Lookup: uz stem -> russian words (strongest first). */
export function uzRuXarita(t: UzRu | null | undefined): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const [u, r] of t?.juftlar ?? []) { const l = m.get(u) ?? []; if (!l.includes(r)) l.push(r); m.set(u, l); }
  return m;
}

/** Extra Russian phrasing for an Uzbek wording ("" when no learned pair applies). */
export function uzRuIbora(matn: string, xarita: Map<string, string[]>): string {
  if (!xarita.size) return '';
  const out: string[] = [];
  for (const w of sozlar(matn)) { const st = ildiz(w); if (st) for (const r of xarita.get(st) ?? []) if (!out.includes(r)) out.push(r); }
  return out.join(' ');
}
