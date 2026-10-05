// Ordinary exported data only; never opens protected databases. Output outside repo.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { createHash } from 'node:crypto';
const [rootArg, outputArg, baseExportArg, priceExportArg] = process.argv.slice(2);
if (!rootArg || !outputArg) throw new Error('Usage: node prepare.mjs <supplemental-directory> <new-output.json>');
const root = resolve(rootArg), output = resolve(outputArg);
const rawWorks = await readFile(resolve(root, 'export/IBASIS.jsonl'));
const rawRecipes = await readFile(resolve(root, 'export/IBASISRES.jsonl'));
const rows = bytes => bytes.toString('utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
const manifestBytes = await readFile(resolve(root, 'blobs/manifest.json'));
const manifest = JSON.parse(manifestBytes.toString('utf8').replace(/^\uFEFF/, ''));
const names = new Map(), digest = createHash('sha256');
for (const bytes of [rawWorks, rawRecipes, manifestBytes]) { digest.update(String(bytes.length) + ':'); digest.update(bytes); }
for (const doc of manifest) {
  if (doc.sourceField !== 'NAMEP') continue;
  if (basename(doc.file) !== doc.file) throw new Error('Unsafe manifest path');
  const bytes = await readFile(resolve(root, 'blobs', doc.file));
  if (bytes.length !== doc.bytes || createHash('sha256').update(bytes).digest('hex') !== doc.sha256.toLowerCase()) throw new Error('BLOB checksum mismatch');
  if (names.has(doc.entityId)) throw new Error('Duplicate source name');
  names.set(doc.entityId, new TextDecoder('windows-1251', { fatal: true }).decode(bytes));
  digest.update(String(bytes.length) + ':'); digest.update(bytes);
}
const works = rows(rawWorks).map(row => ({ ...row, NAMEP: names.get(row.KOD) ?? null }));
const packet = { schema: 'catalog-extraction-review-v1', source: { database: 'smeta/IBASE.GDB', sha256: digest.digest('hex') }, works, recipes: rows(rawRecipes) };
if (baseExportArg || priceExportArg) {
  if (!baseExportArg || !priceExportArg) throw new Error('Both base-export and price-export paths required');
  packet.source.database = 'Base exports + smeta/IBASE.GDB';
  packet.tables = [];
  const allHash = createHash('sha256').update(packet.source.sha256);
  for (const [name, key, dir] of [
    ['BOOK', 'ID', baseExportArg], ['LIBRARY', 'ID', baseExportArg], ['NORMATIV', 'IDNODE', baseExportArg],
    ['POPRAV', 'KOD', baseExportArg], ['POPRAVBASE', 'KOD', baseExportArg], ['PRICE', 'KOD', priceExportArg],
    ['RESURS_TIP', 'KOD', resolve(root, 'export')],
  ]) {
    const bytes = await readFile(resolve(dir, name + '.jsonl'));
    allHash.update(name + ':' + bytes.length + ':'); allHash.update(bytes);
    packet.tables.push({ name, key, rows: rows(bytes) });
  }
  packet.source.sha256 = allHash.digest('hex');
}
await writeFile(output, JSON.stringify(packet), { flag: 'wx' });
console.log(JSON.stringify({ output, works: works.length, recipes: packet.recipes.length, status: 'REVIEW_ONLY' }));
