/**
 * Platform normative catalogue — immutable, revisioned shards (REVIEW_ONLY source data).
 *
 * Built once from the opened corpus (basis/basisres/material/bprice) plus the legacy BOOK
 * tree; uploaded to private R2; browsers fetch only the index and the sbornik shard they
 * open. Nothing here is canonical smeta/F2 truth and nothing converts NULL to zero.
 *
 * Naming evidence: a basis table is labelled from BOOK only when (TipBook, KodA, KodTab)
 * matches exactly ONE BOOK node. TipBook is a book-type letter present in both sources,
 * so it is part of the key, not an "edition" assumption. Ambiguous/missing tables stay
 * in an explicit code-only branch; names never become join identity.
 */
import type { NormCatalog, NormWork } from './norm-catalog';

export const NORM_SHARD_SCHEMA = 'norm-catalog-shards-v1';

export type BookRow = { ID: string; IDPARENT: string | null; NAME: string | null; TIPBOOK: string | null;
  KODA: string | null; KODTAB: string | null; OLITEM?: string | null };

/** [id, parentIndex (-1 root), name, workCount, tableKey | null, status] */
export type TreeNode = [string, number, string, number, string | null, TreeStatus];
export type TreeStatus = 'BOOK' | 'EXACT' | 'MISSING' | 'AMBIGUOUS' | 'GROUP';
/** [id, code, name, tableKey, unitCode, recipeCount, codeAmbiguous(0/1), shard, section, subsection] */
export type WorkIndexRow = [string, string, string | null, string, string | null, number, 0 | 1, string, string | null, string | null];
/** [recipeId, resourceCode, resourceIdCode, norm, status E/A/M, candidateIds, candidateCount] */
export type ShardRecipe = [string, string | null, string | null, string | null, 'E' | 'A' | 'M', string[], number];
/** [code, idCode, name, unitCode, type] */
export type ShardResource = [string | null, string | null, string | null, string | null, string | null];
/** [priceId, region, price, transport] — source candidates, never applied automatically. */
export type ShardPrice = [string, string | null, string | null, string | null];

export type NormShard = { schema: typeof NORM_SHARD_SCHEMA; revision: string; collection: string | null;
  recipes: Record<string, ShardRecipe[]>; resources: Record<string, ShardResource>;
  prices: Record<string, ShardPrice[]>; priceCounts: Record<string, number> };

export type ShardFileMeta = { path: string; sha256: string; bytes: number };
export type NormManifest = {
  schema: typeof NORM_SHARD_SCHEMA; revision: string; status: 'REVIEW_ONLY';
  source: Record<string, unknown>; counts: Record<string, number>;
  linkage: { recipes: { exact: number; missing: number; ambiguous: number; ambiguousWorkRecipes: number };
    tables: { total: number; exact: number; missing: number; ambiguous: number }; worksNamedFromBook: number;
    units?: { matched: number; unmatched: number; ambiguous: number; unitCodes: number; conflicts: number } };
  files: { tree: ShardFileMeta; works: ShardFileMeta; shards: Record<string, ShardFileMeta> };
  caveats: string[];
};

export const tableKey = (w: Pick<NormWork, 'bookType' | 'collection' | 'tableCode'>) =>
  JSON.stringify([w.bookType ?? null, w.collection ?? null, w.tableCode ?? null]);

const cmp = (a: string, b: string) => a.localeCompare(b, 'ru', { numeric: true });

/** Pure BOOK reconciliation; returns named tree nodes + per-table status. Throws on cycles. */
export function reconcileBookTree(book: BookRow[], works: Iterable<NormWork>) {
  const byId = new Map<string, BookRow>();
  for (const r of book) {
    if (!r.ID || byId.has(r.ID)) throw new Error('BOOK_ID_INVALID');
    byId.set(r.ID, r);
  }
  const bookByKey = new Map<string, BookRow[]>();
  for (const r of book) if (r.KODTAB) {
    const k = JSON.stringify([r.TIPBOOK, r.KODA, r.KODTAB]);
    const l = bookByKey.get(k) ?? []; l.push(r); bookByKey.set(k, l);
  }
  const tableWorks = new Map<string, { count: number; collection: string | null; tableCode: string | null }>();
  for (const w of works) {
    const k = tableKey(w), t = tableWorks.get(k);
    if (t) t.count++; else tableWorks.set(k, { count: 1, collection: w.collection, tableCode: w.tableCode });
  }
  const parentOf = (r: BookRow) => r.IDPARENT && r.IDPARENT !== '0' ? byId.get(r.IDPARENT) ?? null : null;
  // Cycle check over the whole BOOK tree (not only mapped branches).
  for (const r of book) {
    const seen = new Set<string>(); let cur: BookRow | null = r;
    while (cur) { if (seen.has(cur.ID)) throw new Error('BOOK_CYCLE'); seen.add(cur.ID); cur = parentOf(cur); }
  }
  const counts = new Map<string, number>(); const tableOf = new Map<string, string>();
  const status = { total: tableWorks.size, exact: 0, missing: 0, ambiguous: 0 };
  let worksNamedFromBook = 0;
  const unresolved: Array<[string, { count: number; collection: string | null; tableCode: string | null }, TreeStatus]> = [];
  for (const [k, t] of tableWorks) {
    const m = bookByKey.get(k) ?? [];
    if (m.length === 1) {
      status.exact++; worksNamedFromBook += t.count; tableOf.set(m[0].ID, k);
      for (let cur: BookRow | null = m[0]; cur; cur = parentOf(cur)) counts.set(cur.ID, (counts.get(cur.ID) ?? 0) + t.count);
    } else { if (m.length) status.ambiguous++; else status.missing++; unresolved.push([k, t, m.length ? 'AMBIGUOUS' : 'MISSING']); }
  }
  const children = new Map<string, BookRow[]>();
  for (const r of book) if (counts.has(r.ID)) {
    const p = parentOf(r)?.ID ?? ''; const l = children.get(p) ?? []; l.push(r); children.set(p, l);
  }
  const order = (a: BookRow, b: BookRow) => (Number(a.OLITEM ?? NaN) - Number(b.OLITEM ?? NaN)) || cmp(a.ID, b.ID);
  const nodes: TreeNode[] = [];
  const walk = (parentKey: string, parentIndex: number) => {
    for (const r of (children.get(parentKey) ?? []).sort(order)) {
      const k = tableOf.get(r.ID) ?? null;
      nodes.push(['b' + r.ID, parentIndex, (r.NAME ?? '').trim() || (r.KODTAB ?? r.KODA ?? '—'), counts.get(r.ID)!, k, k ? 'EXACT' : 'BOOK']);
      walk(r.ID, nodes.length - 1);
    }
  };
  walk('', -1);
  if (unresolved.length) {
    const rootIndex = nodes.length;
    nodes.push(['u', -1, '', unresolved.reduce((s, [, t]) => s + t.count, 0), null, 'GROUP']);
    const groups = new Map<string, Array<(typeof unresolved)[number]>>();
    for (const u of unresolved) { const g = u[1].collection ?? ''; const l = groups.get(g) ?? []; l.push(u); groups.set(g, l); }
    for (const g of [...groups.keys()].sort(cmp)) {
      const list = groups.get(g)!, gi = nodes.length;
      nodes.push(['u:' + g, rootIndex, g, list.reduce((s, [, t]) => s + t.count, 0), null, 'GROUP']);
      for (const [k, t, st] of list.sort((a, b) => cmp(a[1].tableCode ?? '', b[1].tableCode ?? '')))
        nodes.push(['u:' + k, gi, t.tableCode ?? '', t.count, k, st]);
    }
  }
  return { nodes, status, worksNamedFromBook };
}

export type UnitObservation = { kod: string; birlik: string; n: number };
/** KodI → physical unit observed in imported smeta documents. Scale is parsed, never guessed. */
export type UnitEntry = { text: string; scale: string | null; base: string | null; observations: number;
  status: 'OBSERVED' | 'CONFLICT'; variants: Array<[string, number]> };

/** "100М3" → {scale:'100', base:'м3'}; unparseable → nulls (manual basis required). */
const LOOKALIKE: Record<string, string> = { A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х', Y: 'У' };
/** Whitespace removed, upper-case, Latin look-alikes folded to Cyrillic ("100M3" = "100М3"). */
export const unitKey = (text: string) => text.trim().replace(/\s+/g, '').toUpperCase().replace(/[ABCEHKMOPTXY]/g, c => LOOKALIKE[c]);
export function parseUnitText(text: string): { scale: string | null; base: string | null } {
  const t = unitKey(text).toLowerCase();
  const m = t.match(/^(\d+)?(\D.*)$/);
  if (!m) return { scale: null, base: null };
  return { scale: m[1] ?? '1', base: m[2] };
}

/** Exact unique work code only; a KodI with >1 distinct observed unit is CONFLICT (not used). */
export function deriveUnitDictionary(works: Iterable<NormWork>, observations: UnitObservation[]) {
  const byCode = new Map<string, Set<string | null>>();
  for (const w of works) { const s = byCode.get(w.code) ?? new Set(); s.add(w.unitCode); byCode.set(w.code, s); }
  const acc = new Map<string, Map<string, number>>();
  let matched = 0, unmatched = 0, ambiguous = 0;
  for (const o of observations) {
    if (!o || typeof o.kod !== 'string' || typeof o.birlik !== 'string' || !Number.isSafeInteger(o.n) || o.n <= 0) throw new Error('UNIT_OBSERVATION_INVALID');
    const codes = byCode.get(o.kod.trim());
    if (!codes) { unmatched += o.n; continue; }
    const [unit] = [...codes];
    if (codes.size !== 1 || unit == null) { ambiguous += o.n; continue; }
    matched += o.n;
    const key = unitKey(o.birlik);
    const m = acc.get(unit) ?? new Map(); m.set(key, (m.get(key) ?? 0) + o.n); acc.set(unit, m);
  }
  const units: Record<string, UnitEntry> = {};
  for (const [code, m] of [...acc].sort(([a], [b]) => cmp(a, b))) {
    const variants = [...m].sort((a, b) => b[1] - a[1] || cmp(a[0], b[0]));
    const observed = variants.reduce((s, [, n]) => s + n, 0);
    const conflict = variants.length > 1;
    const parsed = conflict ? { scale: null, base: null } : parseUnitText(variants[0][0]);
    units[code] = { text: conflict ? '' : variants[0][0], ...parsed, observations: observed, status: conflict ? 'CONFLICT' : 'OBSERVED', variants };
  }
  return { units, stats: { matched, unmatched, ambiguous, unitCodes: Object.keys(units).length,
    conflicts: Object.values(units).filter(u => u.status === 'CONFLICT').length } };
}

const shardName = (index: number) => `s/${String(index).padStart(4, '0')}.json`;

/**
 * Deterministic shard set. `files` maps path → JSON text; manifest is returned without
 * file hashes (the runner hashes the exact bytes it writes, so hashing stays platform API).
 */
export function buildNormShards(catalog: NormCatalog, book: BookRow[], revision: string, unitObservations: UnitObservation[] = []) {
  if (!/^[a-f0-9]{16,64}$/.test(revision)) throw new Error('REVISION_INVALID');
  const works = [...catalog.works.values()].sort((a, b) => cmp(a.code, b.code) || cmp(a.id, b.id));
  const tree = reconcileBookTree(book, works);
  const unitDictionary = deriveUnitDictionary(works, unitObservations);
  const collections = [...new Set(works.map(w => w.collection ?? ''))].sort(cmp);
  const shardOf = new Map(collections.map((c, i) => [c, shardName(i)]));
  const shards = new Map<string, NormShard>();
  for (const c of collections) shards.set(shardOf.get(c)!, { schema: NORM_SHARD_SCHEMA, revision, collection: c || null,
    recipes: {}, resources: {}, prices: {}, priceCounts: {} });
  const linkage = { exact: 0, missing: 0, ambiguous: 0, ambiguousWorkRecipes: 0 };
  const index: WorkIndexRow[] = [];
  for (const w of works) {
    const path = shardOf.get(w.collection ?? '')!, shard = shards.get(path)!;
    const first = catalog.detail(w.id);
    const list: ShardRecipe[] = [];
    for (let page = 0; page * 25 < first.recipeCount; page++) {
      const d = page === 0 ? first : catalog.detail(w.id, page);
      for (const r of d.recipes) {
        const st = r.resourceStatus === 'EXACT' ? 'E' : r.resourceStatus === 'AMBIGUOUS' ? 'A' : 'M';
        if (first.workCodeAmbiguous) linkage.ambiguousWorkRecipes++;
        else if (st === 'E') linkage.exact++; else if (st === 'A') linkage.ambiguous++; else linkage.missing++;
        for (const c of r.candidates) shard.resources[c.id] = [c.code, c.resourceIdCode, c.name, c.unitCode, c.type];
        const code = r.resourceCode ?? (r.candidateCount === 1 ? r.candidates[0].code : null);
        if (code != null && !shard.prices[code]) {
          shard.prices[code] = r.prices.map(p => [p.id, p.regionCode, p.price, p.transport]);
          shard.priceCounts[code] = r.priceCount;
        }
        list.push([r.id, r.resourceCode, r.resourceIdCode, r.norm, st, r.candidates.map(c => c.id), r.candidateCount]);
      }
    }
    shard.recipes[w.id] = list;
    index.push([w.id, w.code, w.name, tableKey(w), w.unitCode, first.recipeCount, first.workCodeAmbiguous ? 1 : 0, path, w.section, w.subsection]);
  }
  const files = new Map<string, string>();
  files.set('tree.json', JSON.stringify({ schema: NORM_SHARD_SCHEMA, revision, nodes: tree.nodes }));
  files.set('works.json', JSON.stringify({ schema: NORM_SHARD_SCHEMA, revision, works: index, units: unitDictionary.units }));
  const shardIndex: Record<string, string> = {};
  for (const [path, shard] of shards) { files.set(path, JSON.stringify(shard)); shardIndex[shard.collection ?? ''] = path; }
  return { files, shardIndex, counts: { ...catalog.counts }, linkage, tables: tree.status, worksNamedFromBook: tree.worksNamedFromBook, units: unitDictionary.stats };
}

export const NORM_CAVEATS = [
  'REVIEW_ONLY: normativ manba nomzodlari; tasdiqlangan smeta, F2 yoki rasmiy narx emas.',
  'KodI birligi faqat import qilingan real smetalardagi kuzatuv (OBSERVED, ziddiyatsiz) — normativ hujjat tasdig‘i emas; kuzatilmagan KodI uchun asos operator tomonidan kiritiladi.',
  'bprice Rajon/sana/valyuta/QQS semantikasi tasdiqlanmagan — narxlar faqat nomzod.',
  'Manba sonlari floating-point eksportdan; original decimal aniqligi kafolatlanmaydi.',
  'BOOK nomlari faqat yorliq: (TipBook, KodA, KodTab) aniq yagona mos kelganda; noaniq/topilmaganlar alohida.',
];
