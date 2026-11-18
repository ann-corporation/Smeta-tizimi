import { characteristics, normName } from '../smeta-studio/resource-match';
import type { PriceRow } from './price-shards';

export type CatalogSearchHit = { ids: number[]; more: boolean };
export const catalogSearchPath = /^s\/[0-3][a-f0-9]\.json$/;

export function searchPath(key: string): string {
  let hash = 2166136261;
  for (const c of key) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return `s/${(hash & 63).toString(16).padStart(2, '0')}.json`;
}

export function codeSearchKey(code: string): string {
  return 'c:' + normName(code.replace(/[‐‑–—]/g, '-')).replace(/\s*-\s*/g, '-');
}

export function nameSearchKeys(name: string): string[] {
  const normalized = normName(name);
  if (!normalized || normalized.length > 240) return [];
  const exact = 'n:' + normalized.split(' ').sort().join(' ');
  const { family, grade, rebar, diameter, fraction } = characteristics(normalized);
  const signature = grade ?? (rebar && diameter ? rebar + '/' + diameter : fraction);
  return family && signature ? [exact, `s:${family}:${signature}`] : [exact];
}

export function buildCatalogSearch(rows: readonly PriceRow[]): Map<string, string> {
  const buckets = new Map<string, Map<string, CatalogSearchHit>>();
  for (const row of rows) {
    const keys = nameSearchKeys(row[3]);
    if (row[2]?.trim() && row[2].length <= 80) keys.push(codeSearchKey(row[2]));
    for (const key of keys) {
      const path = searchPath(key);
      const entries = buckets.get(path) ?? new Map<string, CatalogSearchHit>();
      buckets.set(path, entries);
      const hit = entries.get(key) ?? { ids: [], more: false };
      if (hit.ids.length < 12) hit.ids.push(row[0]);
      else hit.more = true;
      entries.set(key, hit);
    }
  }
  return new Map([...buckets].sort(([a], [b]) => a.localeCompare(b)).map(([path, rows]) => [path, JSON.stringify(Object.fromEntries(rows))]));
}
