/** Immutable REVIEW_ONLY library source. No price or coefficient acceptance. */
import { sourceMeasureBasis } from '../smeta-studio/source-measure-basis';
import type { UnitBasis } from '../smeta-studio/model';
import { qidiruvKaliti } from '../../i18n/lotin-kirill';
import type { NormWork } from './norm-catalog';
import type { NormDetail, RemoteNormCatalog, RemoteTreeNode } from './norm-remote';
import type { TreeNode, UnitEntry } from './norm-shards';

export const LIBRARY_REVISION = '66bb1a23bd18c63006d447b5';
export type StudioNormCatalog = RemoteNormCatalog | NormLibraryCatalog;
type Meta = { file: string; bytes: number; sha256: string };
export type LibraryManifest = { schema: string; revision: string; status: 'REVIEW_ONLY'; calculation_approved: false;
  counts: Record<string, number>; objects: Meta[]; collection_shards: Record<string, Meta & { works: number }> };
type SourceWork = { key: string; source_id: string; source: number; kind: string; code: string; name: string | null;
  table_key: string; collection_key: string; section_key: string | null; measure: string | null;
  calculation_approved: false; acceptance_status: 'REVIEW_ONLY' };
type Recipe = { norm_key: string; pos: number; res_code: string | null; grp: string; name: string | null; unit: string | null; qty: number | null };
type Navigation = { revision: string; collections: { key: string; title: string }[];
  sections: { key: string; title: string; parent: string }[]; tables: { key: string; title: string; parent: string; parent_kind?: string }[] };
type Collection = { revision: string; key: string; calculation_approved: false; works: SourceWork[]; recipes: Record<string, Recipe[]> };
type Fetcher = (url: string) => Promise<Response>;
const prefix = `norm-library:${LIBRARY_REVISION}:`;
const pageCheck = (p: number) => { if (!Number.isInteger(p) || p < 0) throw new Error('PAGE_INVALID'); };
const hex = (a: ArrayBuffer) => Array.from(new Uint8Array(a), b => b.toString(16).padStart(2, '0')).join('');

/** Expand the shortest JS decimal representation without rounding. */
function decimal(value: number): string {
  const text = String(value);
  if (!/[eE]/.test(text)) return text;
  const [mantissa, exponent] = text.toLowerCase().split('e');
  const negative = mantissa.startsWith('-');
  const unsigned = negative ? mantissa.slice(1) : mantissa;
  const [whole, fraction = ''] = unsigned.split('.');
  const digits = whole + fraction, point = whole.length + Number(exponent);
  const expanded = point <= 0 ? '0.' + '0'.repeat(-point) + digits
    : point >= digits.length ? digits + '0'.repeat(point - digits.length)
    : digits.slice(0, point) + '.' + digits.slice(point);
  return (negative ? '-' : '') + expanded;
}

export class NormLibraryCatalog {
  readonly nodes: TreeNode[] = [];
  private byId = new Map<string, { source: SourceWork; work: NormWork; search: string }>();
  private nodeIndex = new Map<string, number>();
  private children = new Map<number, number[]>();
  private recipes = new Map<string, Recipe[]>();
  private pending = new Map<string, Promise<void>>();
  private loaded = new Set<string>();
  readonly manifest: LibraryManifest;
  private navigation: Navigation;
  private fetcher: Fetcher;
  private base: string;
  private constructor(manifest: LibraryManifest, navigation: Navigation, fetcher: Fetcher, base: string) {
    this.manifest = manifest;
    this.navigation = navigation;
    this.fetcher = fetcher;
    this.base = base;
  }
  private url(file: string) { return `${this.base}?f=${encodeURIComponent(file)}&rev=${LIBRARY_REVISION}`; }
  private static async response(fetcher: Fetcher, url: string) {
    const r = await fetcher(url);
    if (!r.ok) throw new Error(r.status === 401 ? 'AUTH_REQUIRED' : r.status === 404 ? 'NORM_CATALOG_NOT_FOUND' : 'NORM_FETCH_FAILED');
    return r;
  }
  private async text(file: string) {
    const meta = this.manifest.objects.find(m => m.file === file);
    if (!meta) throw new Error('NORM_SHARD_UNKNOWN');
    const bytes = await (await NormLibraryCatalog.response(this.fetcher, this.url(file))).arrayBuffer();
    if (bytes.byteLength !== meta.bytes || hex(await crypto.subtle.digest('SHA-256', bytes)) !== meta.sha256) throw new Error('NORM_INTEGRITY_FAILED');
    // Endpoint deliberately sends raw gzip, without HTTP Content-Encoding.
    return file.endsWith('.gz') ? new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text() : new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  }
  static async open(fetcher: Fetcher = u => fetch(u, { credentials: 'same-origin' }), base = '/api/norm-library') {
    const manifest = await (await this.response(fetcher, `${base}?f=manifest.json&rev=${LIBRARY_REVISION}`)).json() as LibraryManifest;
    if (manifest.schema !== 'norm-library-release-v1' || manifest.revision !== LIBRARY_REVISION || manifest.status !== 'REVIEW_ONLY' || manifest.calculation_approved !== false) throw new Error('NORM_MANIFEST_INVALID');
    const catalog = new NormLibraryCatalog(manifest, {} as Navigation, fetcher, base);
    const [nav, index] = await Promise.all([catalog.text('navigation.json'), catalog.text('works.jsonl.gz')]);
    catalog.navigation = JSON.parse(nav) as Navigation;
    if (catalog.navigation.revision !== LIBRARY_REVISION) throw new Error('NORM_REVISION_MIXED');
    for (const line of index.split(/\r?\n/).filter(l => l.trim())) {
      const s = JSON.parse(line) as SourceWork;
      catalog.validate(s);
      if (catalog.byId.has(s.source_id)) throw new Error('DUPLICATE_SOURCE_ID');
      catalog.byId.set(s.source_id, { source: s, work: { id: s.source_id, code: s.key, name: s.name, bookType: s.kind, collection: s.collection_key, section: s.section_key, subsection: null, tableCode: s.table_key, unitCode: s.measure }, search: qidiruvKaliti(`${s.key} ${s.name ?? ''}`) });
    }
    catalog.buildTree();
    return catalog;
  }
  private validate(s: SourceWork) {
    if (s.source_id !== prefix + s.key || !Number.isSafeInteger(s.source) || s.acceptance_status !== 'REVIEW_ONLY' || s.calculation_approved !== false) throw new Error('NORM_SOURCE_INVALID');
  }
  private buildTree() {
    const n = this.navigation;
    const rows = [...n.collections.map(c => ({ ...c, parent: null, table: false, kind: 'collection', parent_kind: '' })), ...n.sections.map(s => ({ ...s, table: false, kind: 'section', parent_kind: 'collection' })), ...n.tables.map(t => ({ ...t, table: true, kind: 'table', parent_kind: t.parent_kind ?? 'collection' }))];
    for (const r of rows) {
      if (this.nodeIndex.has(r.kind + ':' + r.key)) throw new Error('NORM_NODE_DUPLICATE');
      this.nodeIndex.set(r.kind + ':' + r.key, this.nodes.length);
      this.nodes.push([prefix + r.key, -1, r.title || r.key, 0, r.table ? r.key : null, 'BOOK']);
    }
    rows.forEach((r, i) => {
      const parent = r.parent == null ? -1 : this.nodeIndex.get(r.parent_kind + ':' + r.parent);
      if (parent == null) throw new Error('NORM_PARENT_MISSING');
      this.nodes[i][1] = parent;
      const list = this.children.get(parent) ?? []; list.push(i); this.children.set(parent, list);
    });
    for (let i = 0; i < this.nodes.length; i++) this.breadcrumb(i); // cycle validation
    for (const { source } of this.byId.values()) {
      let i = this.nodeIndex.get('table:' + source.table_key);
      if (i == null) throw new Error('NORM_TABLE_MISSING');
      const root = this.breadcrumb(i)[0].index;
      if (root !== this.nodeIndex.get('collection:' + source.collection_key)) throw new Error('NORM_TABLE_COLLECTION_MISMATCH');
      for (; i >= 0; i = this.nodes[i][1]) this.nodes[i][3]++;
    }
  }
  allWorks(): NormWork[] { return [...this.byId.values()].map(v => v.work); }
  collectionTitle(code: string | null): string | null { return this.navigation.collections.find(c => c.key === code)?.title ?? null; }
  sourceBasis(code: string | null): UnitBasis { return sourceMeasureBasis(code, LIBRARY_REVISION); }
  unit(_code: string | null): UnitEntry | null { return null; }
  tableLabel(id: string): string | null { const w = this.byId.get(id); return w ? this.nodes[this.nodeIndex.get('table:' + w.source.table_key)!][2] : null; }
  node(i: number): RemoteTreeNode {
    const n = this.nodes[i]; if (!n) throw new Error('NODE_NOT_FOUND');
    return { index: i, name: n[2], workCount: n[3], status: n[5], hasChildren: this.children.has(i), isTable: n[4] != null };
  }
  childNodes(parent: number, page = 0) { pageCheck(page); const all = this.children.get(parent) ?? []; return { total: all.length, nodes: all.slice(page * 25, (page + 1) * 25).map(i => this.node(i)) }; }
  breadcrumb(i: number): RemoteTreeNode[] {
    const out: RemoteTreeNode[] = [], seen = new Set<number>();
    for (let c = i; c >= 0; c = this.nodes[c][1]) { if (seen.has(c)) throw new Error('NORM_TREE_CYCLE'); seen.add(c); out.unshift(this.node(c)); }
    return out;
  }
  search(query: string, page: number, scope = -1) {
    pageCheck(page); if (scope >= 0) this.node(scope);
    const words = qidiruvKaliti(query).split(' ').filter(Boolean);
    const rows = [...this.byId.values()].filter(v => words.every(w => v.search.includes(w)) && (scope < 0 || this.breadcrumb(this.nodeIndex.get('table:' + v.source.table_key)!).some(n => n.index === scope))).map(v => v.work);
    return { total: rows.length, rows: rows.slice(page * 25, (page + 1) * 25) };
  }
  searchAny(stems: string[], limit = 30, minHits = 2): NormWork[] {
    const keys = stems.map(qidiruvKaliti).filter(Boolean); if (!keys.length) return [];
    return [...this.byId.values()].map(v => ({ v, hits: keys.filter(k => v.search.includes(k)).length })).filter(v => v.hits >= Math.min(minHits, keys.length)).sort((a, b) => b.hits - a.hits).slice(0, limit).map(v => v.v.work);
  }
  async load(id: string): Promise<void> {
    const w = this.byId.get(id); if (!w) throw new Error('WORK_NOT_FOUND');
    const key = w.source.collection_key;
    if (this.loaded.has(key)) return;
    if (this.pending.has(key)) return this.pending.get(key)!;
    const task = this.loadCollection(key); this.pending.set(key, task);
    try { await task; } finally { this.pending.delete(key); }
  }
  private async loadCollection(key: string) {
    const meta = this.manifest.collection_shards[key]; if (!meta) throw new Error('NORM_SHARD_UNKNOWN');
    const c = JSON.parse(await this.text(meta.file)) as Collection;
    if (c.revision !== LIBRARY_REVISION || c.key !== key || c.calculation_approved !== false) throw new Error('NORM_REVISION_MIXED');
    const staged = new Map<string, Recipe[]>();
    for (const s of c.works) {
      this.validate(s);
      const original = this.byId.get(s.source_id)?.source;
      if (!original || JSON.stringify(original) !== JSON.stringify(s) || s.collection_key !== key) throw new Error('NORM_SOURCE_INVALID');
      const recipes = c.recipes[s.key] ?? [];
      const positions = new Set<number>();
      for (const r of recipes) {
        if (r.norm_key !== s.key || !Number.isSafeInteger(r.pos) || r.pos < 0 || positions.has(r.pos) || (r.qty !== null && (typeof r.qty !== 'number' || !Number.isFinite(r.qty)))) throw new Error('NORM_RECIPE_INVALID');
        positions.add(r.pos);
      }
      staged.set(s.source_id, recipes);
    }
    if (staged.size !== [...this.byId.values()].filter(w => w.source.collection_key === key).length) throw new Error('NORM_COLLECTION_INCOMPLETE');
    for (const [id, recipes] of staged) this.recipes.set(id, recipes);
    this.loaded.add(key);
  }
  detail(id: string, page = 0): NormDetail {
    pageCheck(page); const w = this.byId.get(id); if (!w) throw new Error('WORK_NOT_FOUND');
    const all = this.recipes.get(id); if (!all) throw new Error('NORM_SHARD_NOT_LOADED');
    return { work: w.work, workCodeAmbiguous: false, recipeCount: all.length, recipes: all.slice(page * 25, (page + 1) * 25).map(r => {
      const resourceId = `${id}:source:${w.source.source}:resource:${r.pos}:${encodeURIComponent(r.res_code ?? '')}`;
      return { id: `${resourceId}:recipe`, workCode: w.work.code, resourceCode: r.res_code, resourceIdCode: r.res_code,
        norm: r.qty === null ? null : decimal(r.qty), resourceStatus: 'EXACT', matchBasis: 'SOURCE_ROW',
        candidates: [{ id: resourceId, code: r.res_code, resourceIdCode: r.res_code, name: r.name,
          unitCode: r.unit == null ? null : `norm-unit:${LIBRARY_REVISION}:${encodeURIComponent(r.unit)}`,
          type: ({ labour: 'NORM_LABOUR', machinist: 'NORM_MACHINIST', machine: 'NORM_MACHINE', material: 'NORM_MATERIAL' } as Record<string, string>)[r.grp] ?? null }], candidateCount: 1, prices: [], priceCount: 0 };
    }) };
  }
}







