/** Source catalogue, not canonical smeta/F2 storage. Exact keys only. */
export type NormWork = { id: string; code: string; name: string | null; collection: string | null; section: string | null; unitCode: string | null };
export type NormResource = { id: string; code: string | null; resourceIdCode: string | null; name: string | null; unitCode: string | null; type: string | null };
export type NormRecipe = { id: string; workCode: string; resourceCode: string | null; resourceIdCode: string | null; norm: string | null };
export type NormPrice = { id: string; resourceCode: string | null; regionCode: string | null; price: string | null; transport: string | null };
export class NormCatalog {
  works = new Map<string, NormWork>();
  private worksByCode = new Map<string, NormWork[]>();
  private resources = new Map<string, NormResource[]>();
  private resourcesByIdCode = new Map<string, NormResource[]>();
  private recipes = new Map<string, NormRecipe[]>();
  private prices = new Map<string, NormPrice[]>();
  private seen = new Map<string, Set<string>>();
  counts: Record<string, number> = { basis: 0, basisres: 0, material: 0, bprice: 0 };
  add(table: string, row: Record<string, unknown>) {
    if (!Object.hasOwn(this.counts, table) || !Number.isSafeInteger(row.Kod) || Number(row.Kod) < 0) throw new Error('SOURCE_ID_INVALID');
    const id = String(row.Kod), seen = this.seen.get(table) ?? new Set<string>();
    if (seen.has(id)) throw new Error('DUPLICATE_SOURCE_ID');
    seen.add(id); this.seen.set(table, seen);
    const text = (key: string) => row[key] == null ? null : typeof row[key] === 'string' ? row[key] as string : (() => { throw new Error('SOURCE_TEXT_INVALID'); })();
    const numberText = (key: string) => row[key] == null ? null : typeof row[key] === 'number' && Number.isFinite(row[key]) ? String(row[key]) : (() => { throw new Error('SOURCE_NUMBER_INVALID'); })();
    const name = () => {
      const v = row.NameP;
      if (v == null) return null;
      if (typeof v !== 'object' || Array.isArray(v) || typeof (v as Record<string, unknown>).text_cp1251 !== 'string') throw new Error('SOURCE_NAME_INVALID');
      return (v as { text_cp1251: string }).text_cp1251;
    };
    const push = <T,>(map: Map<string, T[]>, key: string | null, value: T) => { if (key == null) return; const list = map.get(key) ?? []; list.push(value); map.set(key, list); };
    if (table === 'basis') {
      const code = text('KodE'); if (!code) throw new Error('WORK_CODE_MISSING');
      const w = { id, code, name: name(), collection: text('KodA'), section: text('KodRaz'), unitCode: text('KodI') };
      this.works.set(id, w); push(this.worksByCode, code, w);
    } else if (table === 'material') {
      const r = { id, code: text('KodM'), resourceIdCode: text('KodR'), name: name(), unitCode: text('KodI'), type: text('Tip') };
      push(this.resources, r.code, r);
      push(this.resourcesByIdCode, r.resourceIdCode, r);
    } else if (table === 'basisres') {
      const workCode = text('KodE'); if (!workCode) throw new Error('RECIPE_WORK_CODE_MISSING');
      push(this.recipes, workCode, { id, workCode, resourceCode: text('KodM'), resourceIdCode: text('KodR'), norm: numberText('NormaR') });
    } else {
      const p = { id, resourceCode: text('KodM'), regionCode: text('Rajon'), price: numberText('Cena'), transport: numberText('Transp') };
      push(this.prices, p.resourceCode, p);
    }
    this.counts[table]++;
  }
  search(query: string, page: number, collection = '') {
    if (!Number.isInteger(page) || page < 0) throw new Error('PAGE_INVALID');
    const q = query.trim().toLocaleLowerCase('ru'); let total = 0; const rows: NormWork[] = [];
    for (const work of this.works.values()) {
      if (collection && work.collection !== collection) continue;
      if (q && ![work.name, work.code].some(v => v?.toLocaleLowerCase('ru').includes(q))) continue;
      if (total >= page * 25 && rows.length < 25) rows.push(work); total++;
    }
    return { rows, total };
  }
  detail(id: string, page = 0) {
    if (!Number.isInteger(page) || page < 0) throw new Error('PAGE_INVALID');
    const work = this.works.get(id); if (!work) throw new Error('WORK_NOT_FOUND');
    const all = this.recipes.get(work.code) ?? [];
    return { work, workCodeAmbiguous: (this.worksByCode.get(work.code)?.length ?? 0) !== 1,
      recipeCount: all.length, recipes: all.slice(page * 25, (page + 1) * 25).map(recipe => {
        const byMaterial = recipe.resourceCode == null ? null : this.resources.get(recipe.resourceCode) ?? [];
        // KodR is an explicit source resource code, not fuzzy name/row identity.
        // Where both keys exist require their conjunction. Never ignore conflicting KodM.
        const candidates = byMaterial == null ? (recipe.resourceIdCode == null ? [] : this.resourcesByIdCode.get(recipe.resourceIdCode) ?? [])
          : recipe.resourceIdCode == null ? byMaterial : byMaterial.filter(r => r.resourceIdCode === recipe.resourceIdCode);
        const resolvedCode = recipe.resourceCode ?? (candidates.length === 1 ? candidates[0].code : null);
        const prices = resolvedCode == null ? [] : this.prices.get(resolvedCode) ?? [];
        return { ...recipe, resourceStatus: candidates.length === 1 ? 'EXACT' : candidates.length ? 'AMBIGUOUS' : 'MISSING',
          matchBasis: recipe.resourceCode == null ? 'KodR' : recipe.resourceIdCode == null ? 'KodM' : 'KodM+KodR',
          candidates: candidates.slice(0, 25), candidateCount: candidates.length,
          prices: prices.slice(0, 25), priceCount: prices.length };
      }) };
  }
}

// New draft only. Six-decimal quantity / two-decimal money, half-away-from-zero.
const pow = (n: number) => 10n ** BigInt(n);
function fraction(text: string): [bigint, bigint] {
  const m = text.match(/^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i);
  if (!m || text.length > 100) throw new Error('DECIMAL_INVALID');
  const scale = (m[3]?.length ?? 0) - Number(m[4] ?? 0);
  if (!Number.isSafeInteger(scale) || Math.abs(scale) > 38) throw new Error('DECIMAL_INVALID');
  const value = BigInt(m[2] + (m[3] ?? '')) * (m[1] ? -1n : 1n);
  return scale >= 0 ? [value, pow(scale)] : [value * pow(-scale), 1n];
}
function rounded(n: bigint, d: bigint, places: number) {
  if (d <= 0n) throw new Error('BASE_INVALID');
  const sign = n < 0n ? -1n : 1n, a = (n < 0n ? -n : n) * pow(places);
  const v = (a / d + (a % d * 2n >= d ? 1n : 0n)) * sign;
  const digits = (v < 0n ? -v : v).toString().padStart(places + 1, '0');
  return (v < 0n ? '-' : '') + digits.slice(0, -places) + '.' + digits.slice(-places);
}
export function previewResourceQuantity(workQuantity: string, norm: string | null, basisQuantity: string, unitEvidence: string) {
  if (!unitEvidence.trim()) throw new Error('UNIT_BASIS_UNCONFIRMED');
  if (norm == null) return null;
  const [q, qd] = fraction(workQuantity), [n, nd] = fraction(norm), [base, bd] = fraction(basisQuantity);
  if (q < 0n || n < 0n || base <= 0n) throw new Error('QUANTITY_INVALID');
  return rounded(q * n * bd, qd * nd * base, 6);
}
export function previewResourceAmount(quantity: string | null, approvedPrice: string | null) {
  if (quantity == null || approvedPrice == null) return null;
  const [q, qd] = fraction(quantity), [p, pd] = fraction(approvedPrice);
  if (q < 0n) throw new Error('QUANTITY_INVALID');
  if (p < 0n) throw new Error('PRICE_INVALID');
  return rounded(q * p, qd * pd, 2);
}
