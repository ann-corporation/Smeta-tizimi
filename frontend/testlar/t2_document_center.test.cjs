/* DOCUMENT CENTER — real FILE-TRUTH wiring.
   - canonical registry read model (Supabase), bounded, membership-checked
   - private R2 download path, reserve->upload->finalize upload path
   - NO Drive-first flow; a failed Drive replica is never a canonical failure
   - no /api/gas, no demo data on the production route */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const R = (...p) => fs.readFileSync(path.join(__dirname, '..', '..', ...p), 'utf8');
let ok = 0;
const must = (l, c) => { assert(c, l); console.log('  ✅ ' + l); ok++; };
const nocomment = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const mig = R('supabase', 'migrations', '20260906120000_t2_document_registry_read_v1.sql');
const migN = mig.replace(/\s+/g, ' ');
const roll = R('supabase', 'migrations', '20260906120000_t2_document_registry_read_v1.rollback.sql');
const acc = R('supabase', 'migrations', '20260906120000_t2_document_registry_read_v1.acceptance.sql');
const ftMig = R('supabase', 'migrations', '20260902120000_t2_file_truth_r2_canonical_v1.sql');
const fn = R('frontend', 'functions', 'api', 'hujjat-royxat.ts');
const client = R('frontend', 'src', 'api', 't2-hujjat-canonical.ts');
const page = R('frontend', 'src', 'admin', 'pages', 'DocumentsPage.tsx');
const yukla = R('frontend', 'functions', 'api', 'hujjat-yukla.ts');
const olcli = client;

console.log('\n── Canonical registry read model ──');
must('t2_document_registry_v1 exists', /create or replace function public\.t2_document_registry_v1/.test(migN));
must('membership-checked (raises for non-members)', /v_rol := public\.t2_actor_kompaniya_azo_tekshir\(p_kompaniya_id, ?p_actor_id\)/.test(migN));
must('bounded list (limit clamp)', /least\(greatest\(coalesce\(p_limit, ?200\), ?1\), ?500\)/.test(migN) && /limit v_lim/.test(migN));
must('scoped by company + optional project/object', /d\.kompaniya_id ?= ?p_kompaniya_id/.test(migN) && /p_loyiha_id is null or d\.loyiha_id ?= ?p_loyiha_id/.test(migN));
must('maps canonical_storage_status -> Codex DocumentStatus', /'stored' then 'READY'/.test(migN) && /'reserved' then 'UPLOADING'/.test(migN));
must('service_role only', /revoke all on function public\.t2_document_registry_v1/.test(mig));

console.log('\n── Drive failure != canonical failure ──');
must('drive replica status is reported separately from canonicalStatus',
  /'replicas', jsonb_build_array\([\s\S]*?'provider','drive'/.test(migN));
must('a failed Drive replica keeps the document canonicalStatus (READY when stored)',
  !/drive_sync_status='failed'[\s\S]{0,120}canonicalStatus[\s\S]{0,40}ERROR/i.test(migN));
must('health explicitly states canonical files are intact on Drive failure',
  /KANONIK FAYLLAR BUZILMAGAN/.test(mig));
must('drive_replica_failed surfaced as a count, not an error', /'drive_replica_failed', ?coalesce\(v_drive_failed,0\)/.test(migN));

console.log('\n── No Drive-first flow anywhere on the canonical path ──');
for (const [n, s] of [['read model', migN], ['registry fn', nocomment(fn)], ['canonical client', nocomment(client)], ['DocumentsPage', nocomment(page)]]) {
  must(n + ': no DriveApp/SpreadsheetApp/googleapis', !/DriveApp|SpreadsheetApp|drive\.google|sheets\.googleapis/i.test(s));
  must(n + ': no /api/gas', !/\/api\/gas/.test(s));
}

console.log('\n── Private R2 canonical upload/download contracts ──');
must('upload is two-phase reserve -> put -> finalize',
  /reserve/i.test(ftMig) && /finalize/i.test(ftMig) && /reconcile/i.test(ftMig));
must('canonical client uploads via /api/hujjat-yukla (two-phase server)', /fetch\('\/api\/hujjat-yukla'/.test(client));
must('canonical download reads private R2 via /api/hujjat-ol (not Drive)', /\/api\/hujjat-ol\?id=/.test(client));
must('upload fn puts to the PRIVATE canonical bucket binding', /R2_CANONICAL/.test(yukla));
must('client computes sha256 in the browser before streaming', /faylSha256/.test(client) && /crypto\.subtle\.digest\('SHA-256'/.test(client));

console.log('\n── Transport + page ──');
must('registry fn takes actor from session, not body', /tekshir\(ctx\.request\.headers\.get\('Cookie'\)/.test(fn) && /foydalanuvchi_id/.test(fn) && !/body[\s\S]{0,20}actor/i.test(nocomment(fn)));
must('registry fn maps membership failure -> 403', /42501[\s\S]{0,40}403|403[\s\S]{0,40}42501/.test(fn) || /membership/i.test(fn) && /403/.test(fn));
must('client hujjatRoyxatOl hits /api/hujjat-royxat only', /fetch\('\/api\/hujjat-royxat/.test(client));
/* 2026-10-02 (egasi: "R2 ni fayl explorer darajasida"): /admin/documents endi FAYL MENEJERI — real ma'lumot
   (fayl_explorer_v1, a'zolik serverda), yuklab olish/ko'rish — kanonik R2 (/api/hujjat-ol), demo yo'q. */
const menejer = R('frontend', 'src', 'admin', 'sahifalar', 'FaylMenejer.tsx');
const faylApi = R('frontend', 'src', 'api', 't2-fayl.ts');
must('DocumentsPage renders the real FaylMenejer (no demo dataset)',
  /<FaylMenejer/.test(page) && !/demoData|DEMO_DATA|makeDemo|demoDocuments/.test(nocomment(page) + nocomment(menejer)));
must('FaylMenejer feeds on real data from fayl_explorer_v1 via /api/sb', /faylExplorerOl/.test(menejer) && /soro: 'fayl_explorer_v1'/.test(faylApi));
must('FaylMenejer download/preview goes to canonical R2 url', /\/api\/hujjat-ol\?id=/.test(faylApi) && /faylBaytlari/.test(menejer));
must('FaylMenejer: no Drive/GAS on the canonical path', !/DriveApp|drive\.google|\/api\/gas/i.test(nocomment(menejer) + nocomment(faylApi)));

console.log('\n── Migration hygiene ──');
must('rollback drops the function', /drop function if exists public\.t2_document_registry_v1/.test(roll));
must('acceptance raises a PASS sentinel', /DOCUMENT_REGISTRY_ACCEPTANCE_PASS/.test(acc));
must('acceptance proves Drive-failed doc stays READY + health message + non-member block',
  /canonicalStatus.*READY/.test(acc) && /KANONIK FAYLLAR BUZILMAGAN/.test(acc) && /non-?member|999999/.test(acc));
must('additive only (no drop of existing tables/columns)', !/drop table (?!if exists)/i.test(mig) && !/alter table[\s\S]{0,40}drop column/i.test(mig));

console.log('\n' + ok + ' checks passed');
