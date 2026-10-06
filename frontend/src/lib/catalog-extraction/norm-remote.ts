/**
 * Browser client for the platform normative catalogue (REVIEW_ONLY shards served by
 * /api/norm-katalog). Downloads the named tree + work index once per revision (HTTP
 * immutable cache) and a sbornik shard only when a work in it is opened. Every file is
 * verified against the manifest sha256 before use; a mismatch fails closed.
 */
import { qidiruvKaliti } from '../../i18n/lotin-kirill';
import type { NormCatalog, NormPrice, NormResource, NormWork } from './norm-catalog';
import type { NormManifest, NormShard, ShardFileMeta, TreeNode, TreeStatus, UnitEntry, WorkIndexRow } from './norm-shards';

export type NormDetail = ReturnType<NormCatalog['detail']>;
export type NormDetailSource = { detail(id: string, page?: number): NormDetail };
export type RemoteTreeNode = { index: number; name: string; workCount: number; status: TreeStatus; hasChildren: boolean; isTable: boolean };
type Fetcher = (url: string) => Promise<Response>;

const PAGE = 25;
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

async function fetchJson<T>(fetcher: Fetcher, url: string, meta?: ShardFileMeta): Promise<T> {
  const r = await fetcher(url);
  if (!r.ok) throw new Error(r.status === 401 ? 'AUTH_REQUIRED' : r.status === 404 ? 'NORM_CATALOG_NOT_FOUND' : 'NORM_FETCH_FAILED');
  const text = await r.text();
  if (meta) {
    const bytes = new TextEncoder().encode(text);
    if (bytes.length !== meta.bytes || hex(await crypto.subtle.digest('SHA-256', bytes)) !== meta.sha256) throw new Error('NORM_INTEGRITY_FAILED');
  }
  return JSON.parse(text) as T;
}

export class RemoteNormCatalog implements NormDetailSource {
  private children = new Map<number, number[]>();
  private tableKeysUnder = new Map<number, Set<string>>();
  private worksById = new Map<string, { work: NormWork; row: WorkIndexRow; key: string }>();
  private shards = new Map<string, NormShard>();
  private tableNode = new Map<string, number>();
  readonly manifest: NormManifest; readonly nodes: TreeNode[]; readonly works: WorkIndexRow[];
  private units: Record<string, UnitEntry>; private fetcher: Fetcher; private base: string;
  private constructor(manifest: NormManifest, nodes: TreeNode[], works: WorkIndexRow[], units: Record<string, UnitEntry>, fetcher: Fetcher, base: string) {
    this.manifest = manifest; this.nodes = nodes; this.works = works; this.units = units; this.fetcher = fetcher; this.base = base;
    nodes.forEach((n, i) => { const l = this.children.get(n[1]) ?? []; l.push(i); this.children.set(n[1], l); if (n[4]) this.tableNode.set(n[4], i); });
    const keys = new Map<string, Array<string | null>>();
    for (const row of works) {
      let parsed = keys.get(row[3]);
      if (!parsed) { parsed = JSON.parse(row[3]) as Array<string | null>; keys.set(row[3], parsed); }
      const [bookType, collection, tableCode] = parsed;
      const work: NormWork = { id: row[0], code: row[1], name: row[2], bookType, collection, section: row[8], subsection: row[9], tableCode, unitCode: row[4] };
      // Search key is precomputed by the builder with the same qidiruvKaliti (older revisions: computed here).
      this.worksById.set(row[0], { work, row, key: row[10] ?? qidiruvKaliti([row[1], row[2]].filter(Boolean).join(' ')) });
    }
  }

  static async open(fetcher: Fetcher = (u) => fetch(u, { credentials: 'same-origin' }), base = '/api/norm-katalog') {
    const { revision } = await fetchJson<{ revision: string }>(fetcher, `${base}?f=current`);
    if (!/^[a-f0-9]{16}$/.test(revision)) throw new Error('NORM_REVISION_INVALID');
    const url = (f: string) => `${base}?rev=${revision}&f=${encodeURIComponent(f)}`;
    const manifest = await fetchJson<NormManifest>(fetcher, url('manifest.json'));
    if (manifest.revision !== revision || manifest.status !== 'REVIEW_ONLY') throw new Error('NORM_MANIFEST_INVALID');
    const [tree, index] = await Promise.all([
      fetchJson<{ revision: string; nodes: TreeNode[] }>(fetcher, url('tree.json'), manifest.files.tree),
      fetchJson<{ revision: string; works: WorkIndexRow[]; units?: Record<string, UnitEntry> }>(fetcher, url('works.json'), manifest.files.works),
    ]);
    if (tree.revision !== revision || index.revision !== revision) throw new Error('NORM_REVISION_MIXED');
    return new RemoteNormCatalog(manifest, tree.nodes, index.works, index.units ?? {}, fetcher, base);
  }

  /** Observed physical unit for a source KodI; null = unknown (manual basis + evidence). */
  unit(code: string | null): UnitEntry | null { const u = code == null ? null : this.units[code]; return u && u.status === 'OBSERVED' ? u : null; }
  /** Human table name from the named tree (BOOK label or code-only node); null if unknown. */
  tableLabel(workId: string): string | null {
    const w = this.worksById.get(workId); const i = w ? this.tableNode.get(w.row[3]) : undefined;
    return i == null ? null : this.nodes[i][2] || null;
  }
  childNodes(parent: number, page = 0): { nodes: RemoteTreeNode[]; total: number } {
    const all = this.children.get(parent) ?? [];
    return { total: all.length, nodes: all.slice(page * PAGE, (page + 1) * PAGE).map(i => this.node(i)) };
  }
  node(i: number): RemoteTreeNode {
    const n = this.nodes[i];
    if (!n) throw new Error('NODE_NOT_FOUND');
    return { index: i, name: n[2], workCount: n[3], status: n[5], hasChildren: this.children.has(i), isTable: n[4] != null };
  }
  breadcrumb(i: number): RemoteTreeNode[] {
    const out: RemoteTreeNode[] = [];
    for (let cur = i; cur >= 0; cur = this.nodes[cur][1]) out.unshift(this.node(cur));
    return out;
  }
  private keysUnder(i: number): Set<string> {
    let s = this.tableKeysUnder.get(i);
    if (!s) {
      s = new Set(); const stack = [i];
      while (stack.length) { const c = stack.pop()!; const k = this.nodes[c][4]; if (k) s.add(k); stack.push(...(this.children.get(c) ?? [])); }
      this.tableKeysUnder.set(i, s);
    }
    return s;
  }
  /** scope = tree node index (or -1 for everything). Latin/Cyrillic search via qidiruvKaliti. */
  search(query: string, page: number, scope = -1): { rows: NormWork[]; total: number } {
    if (!Number.isInteger(page) || page < 0) throw new Error('PAGE_INVALID');
    // Every word must match (order-free): "армирование фундамент" finds "...фундаментов... армирование".
    const words = qidiruvKaliti(query).split(' ').filter(Boolean), keys = scope >= 0 ? this.keysUnder(scope) : null;
    const rows: NormWork[] = []; let total = 0;
    for (const w of this.worksById.values()) {
      if (keys && !keys.has(w.row[3])) continue;
      if (words.length && !words.every(x => w.key.includes(x))) continue;
      if (total >= page * PAGE && rows.length < PAGE) rows.push(w.work); total++;
    }
    return { rows, total };
  }
  /** Ranked "any word" search: works scored by how many stems their search key contains (≥ minHits). */
  searchAny(stems: string[], limit = 30, minHits = 2): NormWork[] {
    const keys = stems.map(s => qidiruvKaliti(s)).filter(Boolean);
    if (!keys.length) return [];
    const need = Math.min(minHits, keys.length);
    const scored: Array<[number, NormWork]> = [];
    for (const w of this.worksById.values()) {
      let h = 0; for (const k of keys) if (w.key.includes(k)) h++;
      if (h >= need) scored.push([h, w.work]);
    }
    return scored.sort((a, b) => b[0] - a[0]).slice(0, limit).map(x => x[1]);
  }
  /** Loads the sbornik shard for this work (cached, integrity-checked). */
  async load(workId: string): Promise<void> {
    const w = this.worksById.get(workId);
    if (!w) throw new Error('WORK_NOT_FOUND');
    const path = w.row[7];
    if (this.shards.has(path)) return;
    const meta = Object.values(this.manifest.files.shards).find(m => m.path === path);
    if (!meta) throw new Error('NORM_SHARD_UNKNOWN');
    const shard = await fetchJson<NormShard>(this.fetcher, `${this.base}?rev=${this.manifest.revision}&f=${encodeURIComponent(path)}`, meta);
    if (shard.revision !== this.manifest.revision) throw new Error('NORM_REVISION_MIXED');
    this.shards.set(path, shard);
  }
  /** Same shape as NormCatalog.detail so the draft engine is shared. Call load() first. */
  detail(id: string, page = 0): NormDetail {
    if (!Number.isInteger(page) || page < 0) throw new Error('PAGE_INVALID');
    const w = this.worksById.get(id);
    if (!w) throw new Error('WORK_NOT_FOUND');
    const shard = this.shards.get(w.row[7]);
    if (!shard) throw new Error('NORM_SHARD_NOT_LOADED');
    const all = shard.recipes[id] ?? [];
    const resource = (rid: string): NormResource => { const r = shard.resources[rid]; return { id: rid, code: r[0], resourceIdCode: r[1], name: r[2], unitCode: r[3], type: r[4] }; };
    return { work: w.work, workCodeAmbiguous: w.row[6] === 1, recipeCount: all.length,
      recipes: all.slice(page * PAGE, (page + 1) * PAGE).map(([rid, resourceCode, resourceIdCode, norm, st, candidateIds, candidateCount]) => {
        const code = resourceCode ?? (candidateCount === 1 ? shard.resources[candidateIds[0]]?.[0] ?? null : null);
        const prices: NormPrice[] = code == null ? [] : (shard.prices[code] ?? []).map(([pid, regionCode, price, transport]) => ({ id: pid, resourceCode: code, regionCode, price, transport }));
        return { id: rid, workCode: w.work.code, resourceCode, resourceIdCode, norm,
          resourceStatus: st === 'E' ? 'EXACT' : st === 'A' ? 'AMBIGUOUS' : 'MISSING',
          matchBasis: resourceCode == null ? 'KodR' : resourceIdCode == null ? 'KodM' : 'KodM+KodR',
          candidates: candidateIds.map(resource), candidateCount, prices, priceCount: code == null ? 0 : shard.priceCounts[code] ?? prices.length };
      }) };
  }
}
