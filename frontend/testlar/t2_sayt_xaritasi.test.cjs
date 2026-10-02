/*
 * Sayt xaritasi qo'riqchisi. Manifest qo'lda chizilgan diagramma emas:
 * generator App/AdminShell va ikki Cloudflare oq ro'yxatidan qayta quriladi.
 * Generator ishlatilmagan yoki katalog route qamramagan bo'lsa tekshiruv yiqiladi.
 */
const fs = require('fs');
const path = require('path');
const child = require('child_process');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');
const shell = read('src', 'admin', 'AdminShell.tsx');
const app = read('src', 'App.tsx');
const sb = read('functions', 'api', 'sb.ts');
const sbWrite = read('functions', 'api', 'sb-yoz.ts');
const catalog = read('src', 'lib', 'sayt-xaritasi', 'pageCatalog.ts');
const generatedText = read('src', 'lib', 'sayt-xaritasi', 'generated.ts');
const generated = JSON.parse(generatedText.match(/= ([\s\S]+) as const;\s*$/m)[1]);
let passed = 0;
let failed = 0;
function must(label, condition, reason) {
  try { assert.ok(condition, reason || label); console.log(`  ✅ ${label}`); passed++; }
  catch (e) { console.log(`  ❌ ${label} — ${e.message}`); failed++; }
}
function unique(xs) { return [...new Set(xs)]; }

const generatedCheck = child.spawnSync(process.execPath, ['scripts/generate-site-map.mjs', '--check'], { cwd: ROOT, encoding: 'utf8' });
must('generated manifest source bilan mos', generatedCheck.status === 0, generatedCheck.stderr || generatedCheck.stdout);

const menuRoutes = unique([...shell.matchAll(/yol:\s*'([^']+)'/g)].map((m) => m[1]));
const catalogRoutes = unique([...catalog.matchAll(/yol:\s*'([^']+)'/g)].map((m) => m[1]));
for (const route of menuRoutes) must(`menyu yo‘li katalogda: ${route}`, catalogRoutes.includes(route), 'Menyu route sahifa katalogiga kiritilmagan');
must('/admin/sayt-xaritasi App.tsx route sifatida bor', app.includes('path="sayt-xaritasi"'));
must('/admin/sayt-xaritasi Global menyuda bor', shell.includes("/admin/sayt-xaritasi"));
must('manifest menyu yo‘llari AdminShell bilan teng', JSON.stringify(generated.menuRoutes) === JSON.stringify(menuRoutes));
must('manifestda sayt xaritasi segmenti bor', generated.appRouteSegments.includes('sayt-xaritasi'));

const readBlock = (sb.match(/const RUXSAT_JADVALLAR[\s\S]*?\n\]\);/m)?.[0] || '').replace(/\/\*[\s\S]*?\*\//g, '');
const sourceReads = unique([...readBlock.matchAll(/'([^']+)'/g)].map((m) => m[1]));
must('read oq ro‘yxatining barcha elementlari manifestda bor', sourceReads.every((x) => generated.readTables.includes(x)));
must('read manbalari bo‘sh emas', generated.readTables.length > 0);

const sourceWrites = [...sbWrite.matchAll(/^\s*([A-Za-z0-9_]+):\s*\{\s*rpc:\s*'([^']+)'\s*\}/gm)].map((m) => ({ amal: m[1], rpc: m[2] }));
const generatedWrites = new Map(generated.writeActions.map((x) => [x.amal, x.rpc]));
must('write amallarining barchasi manifestda bor', sourceWrites.every((x) => generatedWrites.get(x.amal) === x.rpc));
must('write amallar bo‘sh emas', generated.writeActions.length > 0);

const flowText = read('src', 'lib', 'sayt-xaritasi', 'manifest.ts');
for (const route of [...flowText.matchAll(/'\/(?:admin|boss)[^']+'/g)].map((m) => m[0].slice(1, -1))) {
  must(`oqim yo‘li katalogda: ${route}`, catalogRoutes.includes(route), 'Oqimdagi route katalogsiz qolgan');
}

console.log(`\n═══ ${passed} o‘tdi, ${failed} yiqildi ═══`);
process.exit(failed ? 1 : 0);
