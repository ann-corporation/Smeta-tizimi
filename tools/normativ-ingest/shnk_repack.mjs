// ShNK R2 repack (offline, read-only on inputs, writes only under --out). Needs Node >= 22.18 (runs .ts directly).
//
//   node tools/normativ-ingest/shnk_repack.mjs --report <REPORT_DIR> [--out <DIR>] [--buckets 128] [--prefix normativ/shnk/v1/]
//
// REPORT_DIR is the (private) report folder that contains phase2\ (ingest-queue-all.json, r2\, converted\).
// Output (default <REPORT_DIR>\phase3\r2v1), file paths mirror R2 keys under --prefix:
//   corpus.json.gz              shnk-corpus-v2: docs + bundle/bucket sha256 + table offsets
//   docs/<job_sha>.bundle       one per document: gzip member per unit chunk, gzip manifest member, gzip table member, 12 byte trailer
//   index/bNNN.json.gz          term -> [[docId, unitIdx, tf], ...] hashed into --buckets buckets (FNV-1a, see normativ-token.ts)
//   upload-manifest.json        key, file, sha256, bytes (originals are referenced from their source path, never copied)
// A bundle is a multi-member gzip, so every unit can be fetched with one HTTP Range read (R2 get(key, {range})).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { bucketName, bucketOf, normalise } from '../../frontend/functions/_shared/normativ-token.ts';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) =>
  a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc, []));
if (!args.report) { console.error('--report <REPORT_DIR> is required'); process.exit(2); }
const BUCKETS = Number(args.buckets ?? 128);
const PREFIX = args.prefix ?? 'normativ/shnk/v1/';
const P2 = join(args.report, 'phase2');
const OUT = args.out ?? join(args.report, 'phase3', 'r2v1');
const BLOCK_CHARS = 1800;

const sha = b => createHash('sha256').update(b).digest('hex');
const isGz = b => b.length > 2 && b[0] === 0x1f && b[1] === 0x8b;
const unz = b => (isGz(b) ? gunzipSync(b) : b);
const gz = b => gzipSync(b, { level: 9 });
const readJson = p => JSON.parse(unz(readFileSync(p)).toString('utf8'));
const manifest = [];
function emit(rel, body) {
  const file = join(OUT, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, body);
  const entry = { key: PREFIX + rel, file, sha256: sha(body), bytes: body.length, kind: rel.split('/')[0].replace(/\..*/, '') };
  manifest.push(entry);
  return entry;
}

function csv(text) {
  const rows = []; let row = []; let cell = ''; let q = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && src[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...rest] = rows.filter(r => r.length > 1);
  return rest.map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

// Bundle: members back to back (gzip each), then manifest member, table member, trailer.
function buildBundle(unitBodies, unitMeta, manifestBody) {
  const parts = []; let off = 0;
  const put = body => { parts.push(body); const at = off; off += body.length; return [at, body.length]; };
  const units = unitBodies.map((body, i) => { const [o, l] = put(body); const m = unitMeta[i]; return [o, l, sha(body), m.sahifa_pdf ?? null, m.sahifa_bosma ?? null, m.bob_punkt ?? null, m.jadval_kod ?? null, m.unit ?? '']; });
  const [mo, ml] = put(manifestBody);
  const table = gz(Buffer.from(JSON.stringify({ v: 1, units, manifest: [mo, ml, sha(manifestBody)] }), 'utf8'));
  const [to, tl] = put(table);
  const trailer = Buffer.alloc(12); trailer.write('SNK1', 0, 'ascii'); trailer.writeUInt32BE(to, 4); trailer.writeUInt32BE(tl, 8);
  parts.push(trailer);
  return { body: Buffer.concat(parts), tb: [to, tl, sha(table)] };
}

// ---- inputs
const corpus = readJson(join(P2, 'r2', 'corpus.json.gz'));
const queue = JSON.parse(readFileSync(join(P2, 'ingest-queue-all.json'), 'utf8').replace(/^﻿/, ''));
const queueByJob = new Map(queue.map(r => [r.job_dir.split(/[\\/]/).pop(), r]));
const OBJ = join(P2, 'r2', 'objects', 'normativ');
const docs = []; const postings = new Map(); const originals = new Map();
let unitsTotal = 0;

// ---- 1. PDF documents: re-bundle existing chunk objects (ids and unit indexes unchanged -> old index stays valid)
for (const d of corpus.docs) {
  const m = readJson(join(OBJ, 'manifests', d.job_sha + '.json'));
  const rows = [...m.chunks].sort((a, b) => a.tartib - b.tartib);
  if (rows.length !== d.unit_chunks.length || rows.some((r, i) => r.tartib !== i || r.unit_sha !== d.unit_chunks[i])) throw new Error('UNIT_ORDER_MISMATCH ' + d.code);
  const bodies = rows.map(r => {
    const body = readFileSync(join(OBJ, 'chunks', r.sha256 + '.json'));
    if (sha(body) !== r.sha256) throw new Error('CHUNK_SHA_MISMATCH ' + r.sha256);
    return body;
  });
  const manifestBody = gz(Buffer.from(JSON.stringify(m), 'utf8'));
  const { body, tb } = buildBundle(bodies, rows, manifestBody);
  const bundle = emit('docs/' + d.job_sha + '.bundle', body);
  const row = queueByJob.get(d.job_sha);
  if (row) originals.set(d.source_sha, { file: row.source, bytes: statSync(row.source).size });
  docs.push({ id: d.id, code: d.code, title: d.title, tahrir: d.tahrir, source_type: 'pdf', source_sha: d.source_sha, job_sha: d.job_sha,
    state: d.state, flags: d.flags, pages: d.pages, chars: d.chars, n: rows.length,
    bundle: { key: 'docs/' + d.job_sha + '.bundle', bytes: bundle.bytes, sha256: bundle.sha256 }, tb, original: 'original/' + d.source_sha });
  unitsTotal += rows.length;
}

// ---- 2. old index shards -> buckets
const buckets = Array.from({ length: BUCKETS }, () => new Map());
const shardDir = join(P2, 'r2', 'index', 'v1', 'p');
for (const f of readdirSync(shardDir)) {
  const shard = readJson(join(shardDir, f));
  for (const [term, rows] of Object.entries(shard)) buckets[bucketOf(term, BUCKETS)].set(term, rows);
}

// ---- 3. converted .doc texts: paragraph blocks as units (source_type=doc, no page numbers)
const conv = join(P2, 'converted');
const map = new Map(csv(readFileSync(join(conv, 'doc_map.csv'), 'utf8')).map(r => [r.id, r]));
const docRows = csv(readFileSync(join(conv, 'doc_rows.csv'), 'utf8'));
let nextId = docs.length; let docCount = 0;
for (const r of docRows) {
  const id = r.file.split(' ')[0];
  const mapped = map.get(id);
  const txtPath = join(conv, 'txt', id + '.txt');
  if (!mapped || !existsSync(txtPath)) throw new Error('DOC_MAP_MISSING ' + id);
  const srcBytes = readFileSync(mapped.file); const sourceSha = sha(srcBytes);
  const text = readFileSync(txtPath, 'utf8').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const blocks = []; let cur = [];
  const flush = () => { const t = cur.join('\n').trim(); if (t) blocks.push(t); cur = []; };
  let size = 0;
  for (const line of text.split('\n')) {
    if (!line.trim()) { if (size >= BLOCK_CHARS / 2) { flush(); size = 0; } continue; }
    cur.push(line.trimEnd()); size += line.length;
    if (size >= BLOCK_CHARS) { flush(); size = 0; }
  }
  flush();
  const jobSha = sha(Buffer.from(sourceSha + '|doc-antiword|' + BLOCK_CHARS));
  const meta = []; const bodies = []; let chars = 0;
  blocks.forEach((matn, i) => {
    const unit = 'blok-' + (i + 1);
    chars += matn.length;
    const chunk = { source_sha: sourceSha, unit, matn, sahifa_pdf: null, sahifa_bosma: null, bob_punkt: null, jadval_kod: null, qatorlar: [], origin: 'doc-antiword', reader: 'shnk-doc-pack/1' };
    bodies.push(gz(Buffer.from(JSON.stringify(chunk), 'utf8')));
    meta.push({ unit, sahifa_pdf: null, sahifa_bosma: null, bob_punkt: null, jadval_kod: null });
    const counts = new Map();
    for (const t of normalise(matn)) counts.set(t, (counts.get(t) ?? 0) + 1);
    for (const [t, tf] of counts) {
      const b = buckets[bucketOf(t, BUCKETS)];
      if (!b.has(t)) b.set(t, []);
      b.get(t).push([nextId, i, tf]);
    }
  });
  const flags = ['SOURCE_DOC_ANTIWORD', 'SEMANTIC_REVIEW_REQUIRED', 'AMENDMENT_LINK_REQUIRED'];
  const mf = { doc: { source_sha: sourceSha, job_sha: jobSha, norma_kod: r.code, tahrir: r.edition || null, nom: r.title, bayt: srcBytes.length, review_flags: flags }, source_type: 'doc', zip: mapped.zip };
  const { body, tb } = buildBundle(bodies, meta, gz(Buffer.from(JSON.stringify(mf), 'utf8')));
  const bundle = emit('docs/' + jobSha + '.bundle', body);
  originals.set(sourceSha, { file: mapped.file, bytes: srcBytes.length });
  docs.push({ id: nextId, code: r.code, title: r.title.slice(0, 240), tahrir: r.edition || '', source_type: 'doc', source_sha: sourceSha, job_sha: jobSha,
    state: 'REVIEW_REQUIRED', flags, pages: 0, chars, n: blocks.length,
    bundle: { key: 'docs/' + jobSha + '.bundle', bytes: bundle.bytes, sha256: bundle.sha256 }, tb, original: 'original/' + sourceSha });
  unitsTotal += blocks.length; nextId++; docCount++;
}

// ---- 4. write index buckets, corpus, upload manifest
const indexEntries = buckets.map((terms, i) => {
  const data = {};
  for (const term of [...terms.keys()].sort()) data[term] = terms.get(term);
  const e = emit('index/' + bucketName(i), gz(Buffer.from(JSON.stringify(data), 'utf8')));
  return { k: bucketName(i), sha256: e.sha256, bytes: e.bytes };
});
for (const [osha, o] of originals) manifest.push({ key: PREFIX + 'original/' + osha, file: o.file, sha256: osha, bytes: o.bytes, kind: 'original' });
const corpusBody = gz(Buffer.from(JSON.stringify({ format: 'shnk-corpus-v2', buckets: BUCKETS, hash: 'fnv1a32', units_total: unitsTotal, index: indexEntries, docs }), 'utf8'));
emit('corpus.json.gz', corpusBody);
writeFileSync(join(OUT, 'upload-manifest.json'), JSON.stringify({ prefix: PREFIX, objects: manifest }, null, 1));
const sum = k => manifest.filter(m => m.kind === k);
const mb = a => +(a.reduce((s, m) => s + m.bytes, 0) / 1e6).toFixed(2);
console.log(JSON.stringify({ docs: docs.length, doc_docs: docCount, units: unitsTotal, bundles: sum('docs').length, index_buckets: sum('index').length,
  repacked_objects: manifest.length - sum('original').length, repacked_mb: mb(manifest.filter(m => m.kind !== 'original')), originals: sum('original').length, originals_mb: mb(sum('original')) }));
