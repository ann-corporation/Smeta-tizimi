import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
const require = createRequire(resolve('frontend/package.json'));
const XLSX = require('xlsx');
const [file, folder] = process.argv.slice(2);
if (!file || !folder || existsSync(folder)) throw new Error('INPUT_OR_NEW_OUTPUT_REQUIRED');
const bytes = readFileSync(file), sha256 = createHash('sha256').update(bytes).digest('hex');
const workbook = XLSX.read(bytes, { type: 'buffer', cellFormula: true });
const rows = [], unavailable = [], evidence = [];
for (const sheet of workbook.SheetNames) {
  const ws = workbook.Sheets[sheet], cells = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  if (!/без отчислений на социальное страхование/i.test(cells[0]?.[0] ?? '')) throw new Error('LABOUR_PRICE_BASIS_UNPROVEN');
  const header = cells.findIndex(r => r[1] === 'Регионы');
  const period = String(cells[header]?.[2] ?? '').match(/(20\d{2})\s*год\s*([1-4])-квартал/);
  if (!period || !/12\s*%/.test(String(cells[header]?.[3]))) throw new Error('LABOUR_PERIOD_OR_SOCIAL_RATE_UNPROVEN');
  const year = Number(period[1]), quarter = Number(period[2]);
  for (let i = header + 1; i < cells.length; i++) {
    const [ordinal, region, base, social] = cells[i];
    if (!Number.isInteger(ordinal) || typeof region !== 'string') continue; // excludes working-time footer
    const sourceKey = `${sha256}:${year}:Q${quarter}:${region}`;
    const locator = { sheet, baseCell: `C${i + 1}`, socialCell: `D${i + 1}`, sourceSha256: sha256 };
    evidence.push({ sourceKey, region, year, quarter, base, socialCached: social, socialFormula: ws[`D${i+1}`]?.f ?? null, ...locator });
    if (base == null) { unavailable.push({ sourceKey, region, year, quarter, reason: 'BASE_PRICE_NOT_SUPPLIED', ...locator }); continue; }
    if (typeof base !== 'number' || !Number.isFinite(base) || base <= 0) throw new Error('LABOUR_BASE_PRICE_INVALID');
    if (typeof social !== 'number' || Math.abs(social - base * 1.12) > 0.00001) throw new Error('SOCIAL_PRICE_RECONCILIATION_FAILED');
    rows.push({ id: sourceKey, name: 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', region, aggregate: ordinal === 0,
      year, quarter, unit: 'чел-ч', price: String(base), currency: 'UZS', socialInsurance: 'EXCLUDED',
      socialMultiplier: '1.12', scope: 'CONSTRUCTION_WORKER_REFERENCE', ...locator });
  }
}
if (rows.length !== 30 || unavailable.length !== 30) throw new Error('SOURCE_COVERAGE_CHANGED_REVIEW_REQUIRED');
mkdirSync(folder, { recursive: true });
const payload = { schema: 'labour-hour-source-v1', source: { path: resolve(file), sha256 }, rows, unavailable, evidence };
writeFileSync(join(folder, 'labour.json'), JSON.stringify(payload, null, 2));
console.log(JSON.stringify({ rows: rows.length, unavailable: unavailable.length, sourceSha256: sha256, output: join(folder,'labour.json') }));
