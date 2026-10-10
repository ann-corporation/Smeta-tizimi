import type { PriceCatalog, KatalogQatori } from '../narx-katalog/price-remote';
import { characteristics, matchResource, normName, unitKey, type MatchCatalog, type PriceUnitConversion } from './resource-match';

export type MarketLine = { id: string; name: string | null; unit: string | null; price: number | null };
/** JSON numeric strings are permitted; blank/invalid/unknown values never turn into zero. */
export function marketReadPrice(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim())) return null;
  const n = Number(value); return Number.isFinite(n) ? n : null;
}
export type MarketPeriod = { year: number; quarter: number };
export type MarketOffer = { row: KatalogQatori; price: number; period: MarketPeriod; conversion?: PriceUnitConversion };
export type MarketStatus = 'compared' | 'review' | 'unknown-unit' | 'unsupported' | 'no-offers' | 'unknown-period' | 'unknown-name';
export type MarketComparison = { line: MarketLine; status: MarketStatus; offers: readonly MarketOffer[];
  average: number | null; min: number | null; max: number | null; delta: number | null; percent: number | null };

export const periodKey = (p: MarketPeriod) => `${p.year}-Q${p.quarter}`;
function actualPeriod(year: number | null, quarter: number | null): MarketPeriod | null {
  return Number.isInteger(year) && year! > 0 && Number.isInteger(quarter) && quarter! >= 1 && quarter! <= 4
    ? { year: year!, quarter: quarter! } : null;
}
/** Only wholly absent row periods inherit the manifest: never combine two different periods. */
function rowPeriod(cat: PriceCatalog, row: KatalogQatori) {
  const source = cat.manifest.source.manba;
  return row.yil == null && row.kvartal == null ? actualPeriod(source.yil, source.kvartal) : actualPeriod(row.yil, row.kvartal);
}
export function marketPeriods(cat: PriceCatalog): MarketPeriod[] {
  const seen = new Map<string, MarketPeriod>();
  const source = cat.manifest.source.manba;
  const p = actualPeriod(source.yil, source.kvartal);
  if (p) seen.set(periodKey(p), p);
  for (let i = 0; i < cat.rows.length; i++) {
    const p = rowPeriod(cat, cat.qator(i));
    if (p) seen.set(periodKey(p), p);
  }
  return [...seen.values()].sort((a, b) => b.year - a.year || b.quarter - a.quarter);
}
export function marketRegions(cat: PriceCatalog): Array<[string, string]> {
  const seen = new Map<string, string>();
  cat.dict.hududKalit.forEach((key, i) => { if (key) seen.set(key, cat.dict.hudud[i] ?? key); });
  return [...seen].sort((a, b) => a[1].localeCompare(b[1]));
}

type Product = Omit<MarketComparison, 'line' | 'delta' | 'percent'>;
type Scope = { view: MatchCatalog; products: Map<string, Product> };
const scopes = new WeakMap<PriceCatalog, Map<string, Scope>>();
function scopeOf(cat: PriceCatalog, period: MarketPeriod, region: string | null): Scope {
  let cache = scopes.get(cat);
  if (!cache) { cache = new Map(); scopes.set(cat, cache); }
  const key = JSON.stringify([periodKey(period), region]);
  const old = cache.get(key);
  if (old) return old;
  const base = cat.matchView(), indices: number[] = [];
  for (let i = 0; i < base.size; i++) {
    const p = rowPeriod(cat, base.row(i));
    if (p && periodKey(p) === periodKey(period) && (!region || base.region(i) === region)) indices.push(i);
  }
  const view: MatchCatalog = { size: indices.length, name: i => base.name(indices[i]), unit: i => base.unit(indices[i]),
    region: i => base.region(indices[i]), price: i => {
      const index = indices[i];
      // The panel promises VAT-free averages: unknown VAT must never be treated as VAT-free.
      const vat = base.row(index).nds_holati ?? cat.manifest.source.manba.nds_holati;
      return vat === 'nds_siz' ? base.price(index) : null;
    }, row: i => base.row(indices[i]) };
  const scope = { view, products: new Map<string, Product>() };
  // Bounded selector cache; duplicate resources still share one match across renders.
  if (cache.size >= 16) cache.delete(cache.keys().next().value!);
  cache.set(key, scope);
  return scope;
}
function empty(status: MarketStatus): Product { return { status, offers: [], average: null, min: null, max: null }; }
function product(scope: Scope, name: string | null, unit: string | null, period: MarketPeriod): Product {
  const key = JSON.stringify([normName(name), unitKey(unit)]);
  const old = scope.products.get(key);
  if (old) return old;
  const calculate = (): Product => {
    if (!normName(name)) return empty('unknown-name');
    const family = characteristics(name).family;
    if (/ЧЕЛ|МАШ/.test(normName(unit)) || /SOAT|HOUR/i.test(unit ?? '') || family?.endsWith('labour') ||
      /ЗАТРАТЫ\s+ТРУДА/.test(normName(name))) return empty('unsupported');
    if (!unitKey(unit)) return empty('unknown-unit');
    const match = matchResource(scope.view, name, unit, null, scope.view.size);
    if (!match.best) return empty('no-offers');
    if (match.confidence !== 'EXACT' && match.confidence !== 'HIGH') return empty('review');
    const winner = normName(match.best.row.nom), seen = new Set<string>(), offers: MarketOffer[] = [];
    for (const c of match.candidates) {
      if (normName(c.row.nom) !== winner) continue;
      const original = scope.view.row(c.index), sourcePrice = scope.view.price(c.index);
      if (sourcePrice == null || !Number.isFinite(sourcePrice) || sourcePrice < 0) continue;
      // Use the matcher's proven dimensional scaling, never an independent guessed conversion.
      if (unitKey(original.birlik) !== unitKey(unit) && !c.unitConversion) continue;
      const price = c.unitConversion ? sourcePrice * c.unitConversion.priceFactor : sourcePrice;
      if (!Number.isFinite(price)) continue;
      const k = JSON.stringify([winner, original.manba_id, original.manba_nom, unitKey(original.birlik),
        original.hudud_kalit, original.hudud, original.ishlab_chiqaruvchi, sourcePrice]);
      if (seen.has(k)) continue;
      seen.add(k); offers.push({ row: original, price, period, conversion: c.unitConversion });
    }
    if (!offers.length) return empty('no-offers');
    // Incremental arithmetic mean avoids overflowing a sum of individually finite prices.
    const average = offers.reduce((mean, o, i) => mean + (o.price - mean) / (i + 1), 0);
    return { status: 'compared', offers, average, min: offers.reduce((n, o) => Math.min(n, o.price), Infinity),
      max: offers.reduce((n, o) => Math.max(n, o.price), -Infinity) };
  };
  const result = calculate(); scope.products.set(key, result); return result;
}
/** Read-only comparison. Positive delta means catalogue above estimate; percent uses estimate as basis. */
export function compareMarket(lines: readonly MarketLine[], cat: PriceCatalog, period: MarketPeriod | null = marketPeriods(cat)[0] ?? null,
  region: string | null = null): MarketComparison[] {
  const scope = period ? scopeOf(cat, period, region) : null;
  return lines.map(line => {
    const p = scope && period ? product(scope, line.name, line.unit, period) : empty('unknown-period');
    const knownPrice = line.price != null && Number.isFinite(line.price) && line.price >= 0;
    const delta = knownPrice && p.average != null ? p.average - line.price! : null;
    return { line, ...p, delta, percent: delta != null && line.price! > 0 ? delta / line.price! * 100 : null };
  });
}
export function marketException(r: MarketComparison): boolean {
  return r.status !== 'unsupported' && (r.status !== 'compared' || r.delta == null || r.delta !== 0);
}
