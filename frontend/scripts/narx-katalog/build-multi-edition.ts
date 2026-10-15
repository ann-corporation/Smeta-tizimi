/**
 * Ko'p nashrli platforma narx indeksi: rasmiy Excel nashrlaridan (katalog / asosiy materiallar / birja) bitta R2 reviziya.
 *   node scripts/catalog-extraction/run-ts.mjs scripts/narx-katalog/build-multi-edition.ts <out-dir> <file.xls> [file.xls ...]
 * Chiqish upload-price-shards.mjs bilan mos (gz/<path>.gz + manifest.json). Output dir must not exist.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import * as XLSX from 'xlsx';
import { nashrniOqi } from '../../src/lib/narx-katalog/manba-xls';
import { nashrlarniBirlashtir, reviziyaQur } from '../../src/lib/narx-katalog/nashr-birlashtir';

const [outDir, ...inputs] = process.argv.slice(2);
if (!outDir || !inputs.length) throw new Error('usage: <out-dir> <file.xls> [...]');
if (existsSync(outDir)) throw new Error('OUTPUT_EXISTS ' + outDir);
const nashrlar = inputs.map(f => {
  const bytes = readFileSync(f);
  const wb = XLSX.read(bytes, { type: 'buffer' });
  const sheets = wb.SheetNames.map(nom => ({ nom, rows: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nom], { header: 1, defval: null, raw: true }) }));
  const n = nashrniOqi(basename(f), sheets);
  console.info(JSON.stringify({ fayl: basename(f), tur: n.tur, yil: n.yil, kvartal: n.kvartal, oy: n.oy, sana: n.sana, ...n.hisob, olinmaganVaraqlar: n.hisob.olinmaganVaraqlar.length }));
  return { ...n, sha256: createHash('sha256').update(bytes).digest('hex') };
});
const b = nashrlarniBirlashtir(nashrlar);
const r = await reviziyaQur(b, nashrlar.map(({ qatorlar: _q, ...m }) => m), new Date().toISOString());
for (const f of r.files) {
  const target = join(outDir, 'gz', f.path + '.gz');
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, gzipSync(Buffer.from(f.text, 'utf8'), { level: 9 }), { flag: 'wx' });
}
const text = JSON.stringify(r.manifest, null, 1);
writeFileSync(join(outDir, 'manifest.json'), text, { flag: 'wx' });
writeFileSync(join(outDir, 'gz', 'manifest.json.gz'), gzipSync(Buffer.from(text, 'utf8'), { level: 9 }), { flag: 'wx' });
console.info(JSON.stringify({ revision: r.revision, counts: b.counts }));
