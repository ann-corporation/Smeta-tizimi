// ShNK reader over the R2 search index only (no database). Layout under <prefix> (default normativ/shnk/v1/),
// produced by tools/normativ-ingest/shnk_repack.mjs:
//   corpus.json.gz        shnk-corpus-v2: docs[] + index bucket sha256 list
//   index/bNNN.json.gz    term -> [[docId, unitIdx, tf], ...]; bucket = fnv1a32(term) % corpus.buckets
//   docs/<job>.bundle     gzip member per unit + manifest member + table member + 12 byte trailer; a unit is one Range read
import { normalise, bucketOf, bucketName } from './normativ-token';
import { unpackChunk } from './normativ-evidence';

export const DEFAULT_PREFIX = 'normativ/shnk/v1/';
const TTL_MS = 10 * 60 * 1000;
const MAX_BUCKETS_CACHED = 24;
const MAX_TABLES_CACHED = 64;
const MAX_OBJECT_BYTES = 8 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 24 * 1024 * 1024;

export type R2Source = Pick<R2Bucket, 'get'>;
export type CorpusDoc = {
  id: number; code: string; title: string; tahrir: string; source_type: string; source_sha: string; job_sha: string;
  state: string; flags: string[]; pages: number; chars: number; n: number;
  bundle: { key: string; bytes: number; sha256: string }; tb: [number, number, string]; original: string;
};
export type Corpus = {
  format: 'shnk-corpus-v2'; buckets: number; hash: 'fnv1a32'; units_total: number;
  index: { k: string; sha256: string; bytes: number }[]; docs: CorpusDoc[];
};
type Posting = [number, number, number];
type UnitEntry = { offset: number; length: number; sha: string; sahifa_pdf: number | null; sahifa_bosma: string | null;
  bob_punkt: string | null; jadval_kod: string | null; unit: string };
export type Hit = { doc: CorpusDoc; unit: number; score: number };
export type UnitText = { entry: UnitEntry; matn: string };

const memory = new Map<string, { at: number; value: Promise<unknown> }>();
export function normativR2CacheClear() { memory.clear(); }

function remember<T>(key: string, limitPrefix: string, limit: number, load: () => Promise<T>): Promise<T> {
  const hit = memory.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as Promise<T>;
  const value = load();
  memory.set(key, { at: Date.now(), value });
  value.catch(() => memory.delete(key));
  const same = [...memory.keys()].filter(k => k.startsWith(limitPrefix));
  if (same.length > limit) memory.delete(same[0]);
  return value;
}

const hex = (digest: ArrayBuffer) => Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
const sha256 = async (bytes: ArrayBuffer) => hex(await crypto.subtle.digest('SHA-256', bytes));

async function gunzipLimited(bytes: ArrayBuffer): Promise<ArrayBuffer> {
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const parts: Uint8Array[] = []; let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_UNPACKED_BYTES) { await reader.cancel(); throw new Error('R2_UNPACKED_TOO_LARGE'); }
    parts.push(value);
  }
  const out = new Uint8Array(total); let at = 0;
  for (const p of parts) { out.set(p, at); at += p.byteLength; }
  return out.buffer;
}
const parseJson = async <T>(gz: ArrayBuffer) => JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(await gunzipLimited(gz))) as T;

// Optional Cache API layer (per data centre) so hot corpus/index objects do not cost an R2 read on every isolate.
async function fetchObject(bucket: R2Source, key: string, range?: { offset: number; length: number }): Promise<ArrayBuffer | null> {
  const cacheKey = range ? null : new Request('https://normativ-r2-cache.invalid/' + key);
  const store = cacheKey && typeof caches !== 'undefined' ? (caches as unknown as { default?: Cache }).default : undefined;
  if (store && cacheKey) {
    try { const hit = await store.match(cacheKey); if (hit) return await hit.arrayBuffer(); } catch { /* cache is best effort */ }
  }
  const object = await bucket.get(key, range ? { range } : undefined);
  if (!object) return null;
  const bytes = await object.arrayBuffer();
  if (bytes.byteLength > MAX_OBJECT_BYTES || (range && bytes.byteLength !== range.length)) throw new Error('R2_OBJECT_INVALID');
  if (store && cacheKey) {
    try { await store.put(cacheKey, new Response(bytes.slice(0), { headers: { 'Cache-Control': 'public, max-age=600' } })); } catch { /* ignore */ }
  }
  return bytes;
}

// null = the index is not (yet) in R2; callers may fall back.
export function loadCorpus(bucket: R2Source, prefix = DEFAULT_PREFIX): Promise<Corpus | null> {
  return remember('corpus:' + prefix, 'corpus:', 4, async () => {
    const bytes = await fetchObject(bucket, prefix + 'corpus.json.gz').catch(() => null);
    if (!bytes) return null;
    try {
      const corpus = await parseJson<Corpus>(bytes);
      if (corpus.format !== 'shnk-corpus-v2' || !Number.isInteger(corpus.buckets) || corpus.buckets < 1 || corpus.buckets > 4096 ||
          !Array.isArray(corpus.docs) || !Array.isArray(corpus.index) || corpus.index.length !== corpus.buckets) return null;
      return corpus;
    } catch { return null; }
  });
}

async function loadBucket(bucket: R2Source, prefix: string, corpus: Corpus, index: number): Promise<Map<string, Posting[]>> {
  return remember(`bucket:${prefix}:${index}`, 'bucket:', MAX_BUCKETS_CACHED, async () => {
    const entry = corpus.index[index];
    const bytes = await fetchObject(bucket, prefix + 'index/' + bucketName(index));
    if (!entry || !bytes || (await sha256(bytes)) !== entry.sha256) throw new Error('INDEX_BUCKET_UNAVAILABLE');
    return new Map(Object.entries(await parseJson<Record<string, Posting[]>>(bytes)));
  });
}

async function loadTable(bucket: R2Source, prefix: string, doc: CorpusDoc): Promise<UnitEntry[]> {
  return remember(`table:${prefix}:${doc.job_sha}`, 'table:', MAX_TABLES_CACHED, async () => {
    const [offset, length, digest] = doc.tb;
    const bytes = await fetchObject(bucket, prefix + doc.bundle.key, { offset, length });
    if (!bytes || (await sha256(bytes)) !== digest) throw new Error('BUNDLE_TABLE_INVALID');
    const table = await parseJson<{ v: number; units: [number, number, string, number | null, string | null, string | null, string | null, string][] }>(bytes);
    if (table.v !== 1 || table.units.length !== doc.n) throw new Error('BUNDLE_TABLE_INVALID');
    return table.units.map(([o, l, s, p, pb, b, j, u]) => ({ offset: o, length: l, sha: s, sahifa_pdf: p, sahifa_bosma: pb, bob_punkt: b, jadval_kod: j, unit: u }));
  });
}

export async function readUnit(bucket: R2Source, doc: CorpusDoc, unit: number, prefix = DEFAULT_PREFIX): Promise<UnitText> {
  const table = await loadTable(bucket, prefix, doc);
  const entry = table[unit];
  if (!entry) throw new Error('UNIT_UNAVAILABLE');
  const bytes = await fetchObject(bucket, prefix + doc.bundle.key, { offset: entry.offset, length: entry.length });
  if (!bytes || (await sha256(bytes)) !== entry.sha) throw new Error('CHUNK_SHA_INVALID');
  const chunk = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(await unpackChunk(bytes))) as { source_sha?: unknown; matn?: unknown };
  if (chunk.source_sha !== doc.source_sha || typeof chunk.matn !== 'string' || !chunk.matn.trim()) throw new Error('CHUNK_TEXT_UNAVAILABLE');
  return { entry, matn: chunk.matn };
}

export async function findUnitBySha(bucket: R2Source, doc: CorpusDoc, sha: string, prefix = DEFAULT_PREFIX): Promise<number> {
  return (await loadTable(bucket, prefix, doc)).findIndex(u => u.sha === sha);
}

export const docUuid = (sourceSha: string) =>
  `${sourceSha.slice(0, 8)}-${sourceSha.slice(8, 12)}-${sourceSha.slice(12, 16)}-${sourceSha.slice(16, 20)}-${sourceSha.slice(20, 32)}`;

export type SearchOptions = { q: string; tahrir?: string | null; limit: number; states?: string[]; prefix?: string };
export type SearchResult = { hits: Hit[]; terms: string[]; reason?: 'EDITION_REQUIRED' | 'NOT_FOUND' };

// BM25-style: idf from posting-list length over all units, saturated tf, no length normalisation (units are page-sized).
const K1 = 1.2;
const CODE_BOOST = 50;

export async function searchIndex(bucket: R2Source, corpus: Corpus, opts: SearchOptions): Promise<SearchResult> {
  const prefix = opts.prefix ?? DEFAULT_PREFIX;
  const states = new Set(opts.states ?? ['PUBLISHED']);
  const visible = new Map(corpus.docs.filter(d => states.has(d.state) && (!opts.tahrir || d.tahrir === opts.tahrir)).map(d => [d.id, d]));
  const lowerQuery = opts.q.toLowerCase();
  const codeDocs = [...visible.values()].filter(d => d.code.length >= 4 && lowerQuery.includes(d.code.toLowerCase()));
  const editions = new Set(codeDocs.filter(d => d.tahrir).map(d => d.tahrir));
  if (!opts.tahrir && editions.size > 1) return { hits: [], terms: [], reason: 'EDITION_REQUIRED' };
  let rest = opts.q;
  for (const d of codeDocs) rest = rest.replace(new RegExp(d.code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), ' ');
  const terms = [...new Set(normalise(rest))].slice(0, 8);
  const codeIds = new Set(codeDocs.map(d => d.id));

  const lists = await Promise.all(terms.map(async term => {
    const map = await loadBucket(bucket, prefix, corpus, bucketOf(term, corpus.buckets));
    return { term, rows: map.get(term) ?? [] };
  }));
  const scores = new Map<number, { doc: CorpusDoc; unit: number; score: number; matched: number }>();
  const total = Math.max(corpus.units_total, 1);
  for (const { rows } of lists) {
    const idf = Math.log(1 + (total - rows.length + 0.5) / (rows.length + 0.5));
    for (const [docId, unit, tf] of rows) {
      const doc = visible.get(docId);
      if (!doc || (codeIds.size > 0 && !codeIds.has(docId))) continue;
      const key = docId * 100000 + unit;
      const cell = scores.get(key) ?? { doc, unit, score: 0, matched: 0 };
      cell.score += idf * (tf * (K1 + 1)) / (tf + K1);
      cell.matched += 1;
      scores.set(key, cell);
    }
  }
  // AND across terms first; if nothing intersects, allow one missing term.
  let pool = [...scores.values()].filter(c => c.matched >= terms.length);
  if (pool.length === 0 && terms.length > 1) pool = [...scores.values()].filter(c => c.matched >= terms.length - 1);
  if (codeDocs.length > 0) {
    // A norm code in the query pins the document; remaining words only rank its units (they may be noise like "ShNK").
    pool = [...scores.values()];
    for (const c of pool) c.score += CODE_BOOST;
    if (pool.length === 0) pool = codeDocs.slice(0, opts.limit).map(doc => ({ doc, unit: 0, score: CODE_BOOST, matched: 0 }));
  }
  pool.sort((a, b) => b.score - a.score || a.doc.id - b.doc.id || a.unit - b.unit);
  const perDoc = new Map<number, number>();
  const hits: Hit[] = [];
  for (const c of pool) {
    const count = perDoc.get(c.doc.id) ?? 0;
    if (count >= 2 || hits.length >= opts.limit) continue;
    perDoc.set(c.doc.id, count + 1);
    hits.push({ doc: c.doc, unit: c.unit, score: Math.round(c.score * 1000) / 1000 });
  }
  return { hits, terms, ...(hits.length === 0 ? { reason: 'NOT_FOUND' as const } : {}) };
}

// Snippet window (800 chars) around the first query term found in the unit text.
export function snippet(matn: string, terms: string[]) {
  const lower = matn.toLowerCase();
  const positions = terms.map(t => lower.indexOf(t)).filter(i => i >= 0);
  const anchor = positions.length ? Math.min(...positions) : 0;
  const start = Math.max(0, anchor - 160);
  const end = start + 800;
  return { iqtibos: matn.slice(start, end), qisqartirilgan: start > 0 || matn.length > end };
}

export async function evidenceFor(bucket: R2Source, hit: Hit, terms: string[], company: number, prefix = DEFAULT_PREFIX) {
  const { entry, matn } = await readUnit(bucket, hit.doc, hit.unit, prefix);
  const id = docUuid(hit.doc.source_sha);
  const params = new URLSearchParams({ kompaniya_id: String(company), hujjat_id: id, sha256: entry.sha });
  return {
    hujjat_id: id, norma_kod: hit.doc.code, tahrir: hit.doc.tahrir, nom: hit.doc.title,
    source_sha: hit.doc.source_sha, job_sha: hit.doc.job_sha, sha256: entry.sha, unit: entry.unit,
    sahifa_pdf: entry.sahifa_pdf, sahifa_bosma: entry.sahifa_bosma, bob_punkt: entry.bob_punkt, jadval_kod: entry.jadval_kod,
    source_type: hit.doc.source_type, manba: 'r2', ball: hit.score,
    ...snippet(matn, terms),
    havola: '/api/normativ-qidir?' + params,
  };
}
