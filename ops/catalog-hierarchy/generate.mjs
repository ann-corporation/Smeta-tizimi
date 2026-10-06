import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { reviewHierarchy } from './reconcile.mjs';

const [input, packetPath, output] = process.argv.slice(2);
if (!input || !packetPath || !output) throw new Error('Usage: node generate.mjs SHARD_DIR BOOK_PACKET NEW_OUTPUT_DIR');
if (existsSync(output)) throw new Error('OUTPUT_EXISTS');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const manifest = JSON.parse(readFileSync(join(input, 'manifest.json')));
function index(name) {
  const bytes = gunzipSync(readFileSync(join(input, 'gz', `${name}.json.gz`)));
  const spec = Object.values(manifest.files).find(f => f.path === `${name}.json`);
  if (!spec || spec.sha256 !== sha(bytes) || spec.bytes !== bytes.length) throw new Error(`INDEX_HASH_MISMATCH:${name}`);
  const data = JSON.parse(bytes);
  if (data.revision !== manifest.revision) throw new Error('REVISION_MISMATCH');
  return data;
}
const packetBytes = readFileSync(packetPath);
if (sha(packetBytes) !== manifest.source.bookPacketSha256) throw new Error('BOOK_HASH_MISMATCH');
const book = JSON.parse(packetBytes).tables.find(t => t.name === 'BOOK')?.rows;
if (!book) throw new Error('BOOK_MISSING');
const works = index('works').works, nodes = index('tree').nodes;
const rows = reviewHierarchy(book, works, nodes);
const expected = nodes.find(n => n[0] === 'u')?.[3];
if (rows.length !== expected) throw new Error(`COVERAGE_MISMATCH:${rows.length}/${expected}`);
const counts = {};
for (const row of rows) counts[row.status] = (counts[row.status] ?? 0) + 1;
const report = { schema: 'catalog-hierarchy-review-v1', sourceRevision: manifest.revision,
  sourceBookSha256: sha(packetBytes), expected, actual: rows.length, counts, rows };
mkdirSync(resolve(output), { recursive: true });
const bytes = JSON.stringify(report, null, 2);
writeFileSync(join(output, 'review.json'), bytes);
// Spreadsheet-safe CSV: source strings cannot become executable cell formulas.
const cell = v => '"' + String(v ?? '').replace(/^[=+@-]/, m => "'" + m).replaceAll('"', '""') + '"';
const csv = [['workId','code','name','status','category','reason'], ...rows.map(r => [r.workId,r.code,r.name,r.status,
  r.destination.path?.map(p => p.name).join(' > ') ?? r.destination.label,r.reason])];
writeFileSync(join(output,'review.csv'), '\uFEFF' + csv.map(row => row.map(cell).join(';')).join('\r\n'));
const summary = { sourceRevision: report.sourceRevision, expected, actual: rows.length, counts, reportSha256: sha(bytes),
  officialClassificationApproved: false, websiteIntegrated: false };
writeFileSync(join(output,'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
