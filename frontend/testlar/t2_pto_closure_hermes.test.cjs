/* HERM-001 cross-cutting source smoke. No DB/network/production writes. */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const checks = [];
const must = (name, value) => checks.push({ name, ok: Boolean(value) });

const shell = read('frontend/src/admin/AdminShell.tsx');
const context = read('frontend/src/umumiy/kontekst/PTOWorkspaceContext.tsx');
const scope = read('frontend/src/umumiy/kontekst/routeScope.ts');
const smeta = read('frontend/src/admin/sahifalar/SmetaYuklaNative.tsx');
const exportLib = read('frontend/src/lib/lrv-plus-export.ts');
const active = JSON.parse(read('ops/ACTIVE_TASKS.json'));
const hermes = active.tasks.find((task) => task.id === 'HERM-001');

must('AdminShell mounts one PTO provider', shell.includes('<PTOWorkspaceProvider>') && shell.includes('<PTOWorkspaceBar />'));
must('scope URL has tenant hierarchy fields', ['loyiha', 'obyekt', 'davr', 'hujjat', 'revision'].every((name) => context.includes(`'${name}`)));
must('dynamic PTO paths are company guarded', scope.includes("'/admin/f2': 'OBJECT_SCOPED'") && scope.includes('pathname.startsWith(route + \'/\')'));
must('Smeta reimport is preview-only; delete only for draft (no F2/fakt links)', smeta.includes('smetaQaytaImportDiff') && (!smeta.includes('smeta_tozala') || (smeta.includes('smeta_bogliqlik') && smeta.includes('bogliqlik?.qoralama'))));
/* 2026-09-11 (egasi ko'rsatmasi): manba/checksum endi IXTIYORIY provenance,
   eksportni bloklamaydi. Zaruriy invariant — obyekt konteksti + to'la
   read-model. Provenance berilsa "МАНБА" varag'iga yoziladi. */
must('LRV export requires object context and complete read model', exportLib.includes('OBJECT_CONTEXT_REQUIRED') && exportLib.includes('READ_MODEL_NOT_COMPLETE'));
must('HERMES task stays production-write disabled', hermes && hermes.production_write_allowed === false);
must('HERMES branch is isolated', hermes && hermes.branch === 'hermes/t2-pto-closure-v1');

const failed = checks.filter((check) => !check.ok);
for (const check of checks) console.log(`${check.ok ? '  ✅' : '  ❌'} ${check.name}`);
if (failed.length) process.exitCode = 1;
else console.log(`  ✅ HERM-001 cross-cutting smoke (${checks.length} checks)`);
