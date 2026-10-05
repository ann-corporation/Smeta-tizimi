/**
 * Build the platform normative catalogue shards (REVIEW_ONLY) from the opened corpus.
 *
 *   node scripts/catalog-extraction/run-ts.mjs scripts/catalog-extraction/build-norm-shards.ts \
 *     <paradox-open-dir> <review-packet.json> <output-dir> [unit-observations.json]
 *
 * Source files are opened read-only. Output directory must not exist (no overwrite).
 * Revision = sha256(schema + source checksums.json bytes + packet sha256 + unit-observations sha256)[0..16].
 */
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { NormCatalog } from '../../src/lib/catalog-extraction/norm-catalog';
import { NORM_CAVEATS, NORM_SHARD_SCHEMA, buildNormShards, type BookRow, type NormManifest, type ShardFileMeta } from '../../src/lib/catalog-extraction/norm-shards';

const [sourceDir, packetPath, outDir, unitsPath] = process.argv.slice(2);
if (!sourceDir || !packetPath || !outDir) throw new Error('usage: <paradox-open-dir> <review-packet.json> <output-dir>');
if (existsSync(outDir)) throw new Error('OUTPUT_EXISTS: ' + outDir);

const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const checksumsBytes = readFileSync(join(sourceDir, 'checksums.json'));
const checksums = JSON.parse(checksumsBytes.toString('utf8'));
// Verify every source JSONL against the extraction checksums before trusting it.
const listed: Record<string, { sha256?: string; size?: number }> = checksums.files ?? checksums;
for (const table of ['basis', 'basisres', 'material', 'bprice']) {
  const entry = listed[table + '.jsonl'];
  if (!entry?.sha256) throw new Error('CHECKSUM_MISSING ' + table);
  const h = createHash('sha256');
  await new Promise<void>((ok, fail) => createReadStream(join(sourceDir, table + '.jsonl')).on('data', c => h.update(c)).on('end', () => ok()).on('error', fail));
  if (h.digest('hex') !== entry.sha256.toLowerCase()) throw new Error('CHECKSUM_MISMATCH ' + table);
}
const packetBytes = readFileSync(packetPath);
const packetSha = sha(packetBytes);
const packet = JSON.parse(packetBytes.toString('utf8'));
const book: BookRow[] = packet.tables.find((t: { name: string }) => t.name === 'BOOK')?.rows;
if (!Array.isArray(book) || !book.length) throw new Error('BOOK_MISSING');
const unitsBytes = unitsPath ? readFileSync(unitsPath) : null;
const unitsDoc = unitsBytes ? JSON.parse(unitsBytes.toString('utf8')) : null;
if (unitsDoc && (unitsDoc.schema !== 'work-unit-observations-v1' || !Array.isArray(unitsDoc.rows))) throw new Error('UNIT_OBSERVATIONS_INVALID');
const unitsSha = unitsBytes ? sha(unitsBytes) : 'none';
const revision = sha(NORM_SHARD_SCHEMA + '\n' + sha(checksumsBytes) + '\n' + packetSha + '\n' + unitsSha).slice(0, 16);

const started = Date.now();
const catalog = new NormCatalog();
for (const table of ['basis', 'material', 'basisres', 'bprice']) {
  const lines = createInterface({ input: createReadStream(join(sourceDir, table + '.jsonl'), { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of lines) if (line.trim()) catalog.add(table, JSON.parse(line));
}
const built = buildNormShards(catalog, book, revision, unitsDoc?.rows ?? []);
const meta = (path: string): ShardFileMeta => {
  const bytes = Buffer.from(built.files.get(path)!, 'utf8');
  const target = join(outDir, 'gz', path + '.gz');
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, gzipSync(bytes, { level: 9 }), { flag: 'wx' });
  return { path, sha256: sha(bytes), bytes: bytes.length };
};
mkdirSync(outDir, { recursive: true });
const shards: Record<string, ShardFileMeta> = {};
for (const [collection, path] of Object.entries(built.shardIndex)) shards[collection] = meta(path);
const manifest: NormManifest = {
  schema: NORM_SHARD_SCHEMA, revision, status: 'REVIEW_ONLY',
  source: { corpus: 'paradox-open', checksumsSha256: sha(checksumsBytes), files: listed, bookPacketSha256: packetSha,
    bookPacketSchema: packet.schema ?? null, unitObservationsSha256: unitsBytes ? unitsSha : null,
    unitObservationsSource: unitsDoc ? { source: unitsDoc.source, capturedAt: unitsDoc.capturedAt, query: unitsDoc.query } : null, builtAt: new Date().toISOString() },
  counts: built.counts,
  linkage: { recipes: built.linkage, tables: built.tables, worksNamedFromBook: built.worksNamedFromBook, units: built.units },
  files: { tree: meta('tree.json'), works: meta('works.json'), shards },
  caveats: NORM_CAVEATS,
};
const manifestText = JSON.stringify(manifest, null, 1);
writeFileSync(join(outDir, 'gz', 'manifest.json.gz'), gzipSync(Buffer.from(manifestText, 'utf8'), { level: 9 }), { flag: 'wx' });
writeFileSync(join(outDir, 'manifest.json'), manifestText, { flag: 'wx' });
console.info(JSON.stringify({ revision, counts: built.counts, linkage: manifest.linkage, shards: Object.keys(shards).length, ms: Date.now() - started }));
