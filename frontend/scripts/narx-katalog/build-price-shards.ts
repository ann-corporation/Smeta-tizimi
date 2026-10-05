/**
 * Build the platform price catalogue shards from a verified DB export (JSONL of ExportRow).
 *   node scripts/catalog-extraction/run-ts.mjs scripts/narx-katalog/build-price-shards.ts <export.jsonl> <manba.json> <out-dir>
 * manba.json: { manba: PriceManba, hududKalit: {hudud: kalit}, dbChecksum: {md5, rows, query} }
 * Output dir must not exist. Upload with scripts/narx-katalog/upload-price-shards.mjs.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { PRICE_BUILD_FORMAT, PRICE_SHARD_SCHEMA, buildPriceShards, type ExportRow } from '../../src/lib/narx-katalog/price-shards';

const [exportPath, manbaPath, outDir] = process.argv.slice(2);
if (!exportPath || !manbaPath || !outDir) throw new Error('usage: <export.jsonl> <manba.json> <out-dir>');
if (existsSync(outDir)) throw new Error('OUTPUT_EXISTS ' + outDir);
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const exportBytes = readFileSync(exportPath);
const meta = JSON.parse(readFileSync(manbaPath, 'utf8'));
const rows = exportBytes.toString('utf8').trim().split('\n').map(l => JSON.parse(l) as ExportRow);
if (meta.dbChecksum?.rows !== rows.length) throw new Error('ROW_COUNT_MISMATCH vs DB');
// Re-verify the DB checksum recorded at export time (same projection as the SQL md5).
const c = (v: unknown) => v == null ? '~' : String(v);
const md5 = createHash('md5').update(rows.map(r => [r[0], c(r[6]), c(r[4]), c(r[5]), c(r[15]), c(r[16]), c(r[7])].join('|')).join('\n'), 'utf8').digest('hex');
if (md5 !== meta.dbChecksum.md5) throw new Error('DB_CHECKSUM_MISMATCH');

const revision = sha(PRICE_SHARD_SCHEMA + '\nformat:' + PRICE_BUILD_FORMAT + '\n' + sha(exportBytes) + '\n' + sha(JSON.stringify(meta))).slice(0, 16);
const built = buildPriceShards(rows, meta.manba, meta.hududKalit);
mkdirSync(outDir, { recursive: true });
const files: Record<string, { path: string; sha256: string; bytes: number }> = {};
for (const [path, text] of built.files) {
  const bytes = Buffer.from(text, 'utf8');
  const target = join(outDir, 'gz', path + '.gz');
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, gzipSync(bytes, { level: 9 }), { flag: 'wx' });
  files[path] = { path, sha256: sha(bytes), bytes: bytes.length };
}
const manifest = { schema: PRICE_SHARD_SCHEMA, revision, status: 'REFERENCE', builtAt: new Date().toISOString(),
  source: { table: 't2_narx_manba_qator', manba: meta.manba, exportSha256: sha(exportBytes), dbChecksum: meta.dbChecksum },
  counts: built.counts, files: { dict: files['dict.json'], rows: built.rowFiles.map(p => files[p]) } };
const text = JSON.stringify(manifest, null, 1);
writeFileSync(join(outDir, 'manifest.json'), text, { flag: 'wx' });
writeFileSync(join(outDir, 'gz', 'manifest.json.gz'), gzipSync(Buffer.from(text, 'utf8'), { level: 9 }), { flag: 'wx' });
console.info(JSON.stringify({ revision, counts: built.counts, rowFiles: built.rowFiles.length }));
