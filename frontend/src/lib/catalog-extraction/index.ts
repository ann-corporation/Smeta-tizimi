/** Extraction source IDs are NOT canonical business IDs. No DB writes or arithmetic. */
export type SourceRow = Record<string, string | null>;
export type ExtractionPacket = {
  schema: 'catalog-extraction-review-v1';
  source: { database: string; sha256: string };
  works: SourceRow[];
  recipes: SourceRow[];
  tables?: { name: string; key: string; rows: SourceRow[] }[];
};
export type ReviewWork = {
  sourceIdentity: string; code: string; name: string | null;
  collection: string | null; section: string | null; subsection: string | null;
  unitCode: string | null; source: SourceRow;
  recipes: { sourceIdentity: string; resourceCode: string | null; normText: string | null; source: SourceRow }[];
};
export type ExtractionReview = {
  source: ExtractionPacket['source']; works: ReviewWork[]; recipeCount: number;
  status: 'REVIEW_ONLY'; blockers: readonly string[];
  tables: NonNullable<ExtractionPacket['tables']>;
};
const fail = (): never => { throw new Error('Katalog paketi noto‘g‘ri yoki bog‘lanishlari noaniq.'); };
function sourceRows(value: unknown, key = 'KOD'): SourceRow[] {
  if (!Array.isArray(value) || value.length > 600_000) return fail();
  const seen = new Set<string>();
  for (const row of value) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return fail();
    if (Object.values(row).some(x => x !== null && typeof x !== 'string')) return fail();
    if (typeof row[key] !== 'string' || !row[key]!.trim() || seen.has(row[key]!)) return fail();
    seen.add(row[key]!);
  }
  return value;
}
export function buildExtractionReview(input: unknown): ExtractionReview {
  if (!input || typeof input !== 'object') return fail();
  const p = input as ExtractionPacket;
  if (p.schema !== 'catalog-extraction-review-v1' || !p.source
    || typeof p.source.database !== 'string' || !p.source.database.trim()
    || !/^[a-f0-9]{64}$/.test(p.source.sha256)) return fail();
  const works = sourceRows(p.works), recipes = sourceRows(p.recipes);
  const tables: NonNullable<ExtractionPacket['tables']> = [];
  const allowed: Record<string, string> = { BOOK: 'ID', LIBRARY: 'ID', NORMATIV: 'IDNODE', POPRAV: 'KOD', POPRAVBASE: 'KOD', PRICE: 'KOD', RESURS_TIP: 'KOD' };
  if (p.tables !== undefined) {
    if (!Array.isArray(p.tables) || p.tables.length > 7) return fail();
    const seenTables = new Set<string>();
    for (const table of p.tables) {
      if (!table || !Object.hasOwn(allowed, table.name) || table.key !== allowed[table.name] || seenTables.has(table.name)) return fail();
      seenTables.add(table.name);
      tables.push({ name: table.name, key: table.key, rows: sourceRows(table.rows, table.key).map(row => ({ ...row })) });
    }
  }
  const codeIndex = new Map<string, ReviewWork>();
  const identity = (table: string, id: string) => JSON.stringify([p.source.database, p.source.sha256, table, id]);
  for (const row of works) {
    if (!row.KODE || codeIndex.has(row.KODE)) return fail();
    codeIndex.set(row.KODE, {
      sourceIdentity: identity('IBASIS', row.KOD!), code: row.KODE, name: row.NAMEP ?? null,
      collection: row.KODA ?? null, section: row.KODRAZ ?? null, subsection: row.KODPRAZ ?? null,
      unitCode: row.KODI ?? null, source: { ...row }, recipes: [],
    });
  }
  for (const row of recipes) {
    const work = row.KODE ? codeIndex.get(row.KODE) : undefined;
    if (!work) return fail();
    if (row.NORMAR != null && !/^-?\d+(?:\.\d+)?$/.test(row.NORMAR)) return fail();
    work.recipes.push({ sourceIdentity: identity('IBASISRES', row.KOD!),
      resourceCode: row.KODR ?? null, normText: row.NORMAR ?? null, source: { ...row } });
  }
  return { source: { ...p.source }, works: [...codeIndex.values()], recipeCount: recipes.length,
    tables, status: 'REVIEW_ONLY', blockers: ['NORMATIVE_EDITION_UNVERIFIED', 'UNIT_CODE_UNVERIFIED', 'RESOURCE_NAME_UNVERIFIED'] };
}
export function sourceTablePage(review: ExtractionReview, name: string, search: string, page: number) {
  if (!Number.isInteger(page) || page < 0) return fail();
  const table = review.tables.find(v => v.name === name);
  if (!table) return { total: 0, rows: [] as SourceRow[], columns: [] as string[] };
  const query = search.trim().toLocaleLowerCase('ru');
  const filtered = query ? table.rows.filter(row => Object.values(row).some(v => v?.toLocaleLowerCase('ru').includes(query))) : table.rows;
  return { total: filtered.length, rows: filtered.slice(page * 25, (page + 1) * 25), columns: Object.keys(table.rows[0] ?? {}) };
}
export function reviewPage(review: ExtractionReview, search: string, page: number, pageSize = 25) {
  if (!Number.isInteger(page) || page < 0 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) return fail();
  const query = search.trim().toLocaleLowerCase('ru');
  const matches = review.works.filter(w => !query || [w.code, w.name, w.collection, w.section]
    .some(v => v?.toLocaleLowerCase('ru').includes(query)));
  return { total: matches.length, rows: matches.slice(page * pageSize, (page + 1) * pageSize) };
}
