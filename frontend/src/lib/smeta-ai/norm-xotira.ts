/**
 * Company memory for norm matching (owner: "the system learns with use"): once a line is confirmed in a company, the same or a
 * similar text gets that norm FIRST next time.
 *
 * Stored as compact per-company COUNTERS, never raw text: for every confirmed norm code, how often it was confirmed and how often
 * each word STEM (as a 32-bit hash) was in the confirmed line. A query is scored by the share of its stems the code has seen.
 * Shape (JSON, a few hundred bytes per code):  { v: 1, k: { "Е6-1-1-1": { n: 3, s: { "1a2b3c": 3, ... } } } }
 * Persistence design (NOT applied): supabase/manual/NOT_APPLIED_t2_norma_xotira_hisoblagich_v1.sql.
 */
import { ildizlar } from './matn-qidiruv';
import { kodKalit } from './resurs-kalit';

export type XotiraKod = { n: number; s: Record<string, number> };
export type Xotira = { v: 1; k: Record<string, XotiraKod> };

export const xotiraBosh = (): Xotira => ({ v: 1, k: {} });

/** FNV-1a 32-bit, base 36: a stem cannot be read back from it. */
export function stemHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}
const MAX_STEM = 14;
/** Distinct word stems of a line (numbers kept: «М-100», «диаметр 50» tell variants apart), hashed. */
export function belgilar(matn: string): string[] {
  return [...new Set(ildizlar(matn.split('#')[0]))].slice(0, MAX_STEM).map(stemHash);
}

/** A line was confirmed for `kod` (accepted suggestion or chosen by hand). Mutates and returns the memory. */
export function xotiraYoz(x: Xotira, matn: string, kod: string): Xotira {
  const key = kodKalit(kod);
  if (!key) return x;
  const e = x.k[key] ?? (x.k[key] = { n: 0, s: {} });
  e.n++;
  for (const h of belgilar(matn)) e.s[h] = (e.s[h] ?? 0) + 1;
  return x;
}

/** The user rejected `kod` for this text: its counters for these stems go down (never below zero). */
export function xotiraRad(x: Xotira, matn: string, kod: string): Xotira {
  const e = x.k[kodKalit(kod) ?? ''];
  if (!e) return x;
  for (const h of belgilar(matn)) if (e.s[h]) { e.s[h]--; if (e.s[h] <= 0) delete e.s[h]; }
  return x;
}

/**
 * Per canonical code: 0..1 = (share of the query's stems this code has seen confirmed) × (how often it was confirmed: 1 time = 0.7,
 * 3+ times = 1). Only codes that saw at least half of the query count.
 */
export function xotiraBall(x: Xotira | null | undefined, matn: string): Map<string, number> {
  const out = new Map<string, number>();
  if (!x) return out;
  const q = belgilar(matn);
  if (q.length < 2) return out;
  for (const [kod, e] of Object.entries(x.k)) {
    let seen = 0;
    for (const h of q) if ((e.s[h] ?? 0) > 0) seen++;
    const cover = seen / q.length;
    if (cover < 0.5) continue;
    out.set(kod, Math.round(cover * (0.7 + 0.3 * Math.min(1, (e.n - 1) / 2)) * 1000) / 1000);
  }
  return out;
}

const SAQLASH = (kompaniyaId: number) => `moslash-xotira:v1:${kompaniyaId}`;
/** Interim persistence: this browser, per company (counters only). The shared per-company table is designed, not applied. */
export function xotiraOl(kompaniyaId: number | null): Xotira {
  if (kompaniyaId == null) return xotiraBosh();
  try {
    const x = JSON.parse(localStorage.getItem(SAQLASH(kompaniyaId)) ?? 'null') as Xotira | null;
    return x && x.v === 1 && x.k && typeof x.k === 'object' ? x : xotiraBosh();
  } catch { return xotiraBosh(); }
}
export function xotiraSaqla(kompaniyaId: number | null, x: Xotira): void {
  if (kompaniyaId == null) return;
  try { localStorage.setItem(SAQLASH(kompaniyaId), JSON.stringify(xotiraQisqartir(x))); } catch { /* storage off: the memory is a convenience */ }
}

/** Keeps the memory small: the most used codes only, rare stems dropped. */
export function xotiraQisqartir(x: Xotira, maxKod = 3000): Xotira {
  const keys = Object.keys(x.k);
  if (keys.length > maxKod) {
    for (const k of keys.sort((a, b) => x.k[b].n - x.k[a].n).slice(maxKod)) delete x.k[k];
  }
  return x;
}
