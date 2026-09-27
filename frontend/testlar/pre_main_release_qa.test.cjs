/* Pre-main hostile static contract guard. It reads source only: no network, credentials, or mutations. */
const fs = require('fs'); const path = require('path'); const assert = require('assert');
const root = path.join(__dirname, '..', '..'); const R = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');
const exists = (...p) => fs.existsSync(path.join(root, ...p)); let ok = 0;
const must = (label, condition) => { assert(condition, label); console.log('  ✅ ' + label); ok++; };
const source = (...p) => R(...p).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
const migrationDir = path.join(root, 'supabase', 'migrations');
const migrations = fs.readdirSync(migrationDir).filter(name => /^\d{14}_.+\.sql$/.test(name) && !/\.(rollback|acceptance)\.sql$/.test(name)).sort();

console.log('\n── Canonical truth and Workbench boundary ──');
const canonicalClient = source('frontend','src','api','t2-hujjat-canonical.ts');
const workbenchAdapter = source('frontend','src','api','t2-document-control.ts');
const workbenchGateway = source('frontend','functions','api','hujjat-nazorat.ts');
const upload = source('frontend','functions','api','hujjat-yukla.ts');
const download = source('frontend','functions','api','hujjat-ol.ts');
must('Drive and Sheets remain secondary replicas, not canonical identity', /\/api\/hujjat-yukla/.test(canonicalClient) && /\/api\/hujjat-ol/.test(canonicalClient) && !/DriveApp|SpreadsheetApp|googleapis|drive\.google/.test(canonicalClient));
must('Workbench frontend uses its typed API port, not direct Supabase', /fetch\('\/api\/hujjat-nazorat\?/.test(workbenchAdapter) && !/supabase\.|createClient\(|\/rest\/v1\//.test(workbenchAdapter));
must('Workbench gateway has no Drive, Sheets, or GAS interaction', !/DriveApp|SpreadsheetApp|\/api\/gas|googleapis/.test(workbenchGateway));
must('canonical download has authenticated metadata authorization then private R2', /tekshir\(/.test(download) && /R2_CANONICAL\.get/.test(download) && !/drive|sheets|gas/i.test(download));
must('canonical upload is reserve -> private R2 -> finalize, not synchronous Drive', /t2_document_canonical_reserve_v1/.test(upload) && /R2_CANONICAL\.put/.test(upload) && /t2_document_canonical_finalize_v1/.test(upload) && !/DriveApp|SpreadsheetApp|\/api\/gas/.test(upload));
must('canonical key is not filename identity', !/r2Key\s*=\s*.*file\.name/.test(upload) && /r2_key/.test(upload));

console.log('\n── Tenant, auth, idempotency and optimistic-lock source contracts ──');
const security = source('frontend','testlar','t2_security_p0.test.cjs');
const fileTruth = R('supabase','migrations','20260902120000_t2_file_truth_r2_canonical_v1.sql');
const change = R('supabase','migrations','20260911120000_t2_smeta_change_control_v1.sql');
const onboarding = R('supabase','migrations','20260905120000_t2_company_onboarding_v1.sql');
must('actor is resolved from verified session, never accepted from Workbench request', /actorFrom/.test(workbenchGateway) && /foydalanuvchi_id/.test(workbenchGateway) && !/b\.(actor_id|actorId|p_actor_id)/.test(workbenchGateway));
must('cross-tenant document lineage rejects swapped project/object/company IDs', /STORAGE_TENANT_MISMATCH/.test(fileTruth) && /PROJECT_COMPANY_MISMATCH/.test(fileTruth));
must('canonical operation_id retry is idempotent and rejects mismatched replay', /operation_id/.test(fileTruth) && /'retry',true/.test(fileTruth));
must('change approval has stale-version protection and atomic preflight', /STALE|versiya/.test(change) && /CHANGE_PREFLIGHT_FAILED/.test(change));
must('director/last-director source guard remains part of release', /director|rahbar|boss/i.test(onboarding) && /t2_azo_actor_director_tekshir|last/i.test(onboarding));
must('unauthenticated Workbench and registry fail closed', /AUTH_REQUIRED/.test(workbenchGateway) && /AUTH_REQUIRED/.test(source('frontend','functions','api','hujjat-royxat.ts')));
must('existing security P0 suite stays registered as a release dependency', /t2_security_p0\.test\.cjs/.test(R('frontend','testlar','hammasi.cjs')) && security.includes('Session actor identity'));

console.log('\n── F2, Nakopitelniy, fidelity and exception contracts ──');
const calc = R('frontend','src','lib','construction-document-control','calculation.ts');
const validation = R('frontend','src','lib','construction-document-control','validation.ts');
const types = R('frontend','src','lib','construction-document-control','types.ts');
const fidelity = R('frontend','src','lib','construction-document-control','document-fidelity.test.ts');
must('certified F2 amount stays the exact source fact (no quantity × price fallback)',
  /certifiedAmount/.test(calc) && /MISSING_CERTIFIED_AMOUNT/.test(calc) && !/val\(x\.quantity,x\.f2ValuationPrice!\)/.test(calc));
must('baseline, certified F2 and actual procurement are separate values', /baselineReferencePrice/.test(calc) && /f2ValuationPrice/.test(calc) && /actualProcurementPrice/.test(calc));
must('pending/rejected changes cannot enter approved entitlement', /c\.status === 'approved'/.test(calc));
must('historical F2 is pure/read-only and price variance is surfaced', /does not mutate certified history/.test(calc) && /PRICE_VARIANCE/.test(calc));
must('official export strips technical identity and change metadata', /officialRows/.test(validation) && !/lineId:row\.lineId/.test((validation.match(/const officialRows[\s\S]*?return\{/ ) || [''])[0]));
must('no replacement/additional banner or name rewrite is permitted', /not\.toMatch\(\/ZAMENA/.test(fidelity) && /description\).toBe\('Sement'/.test(fidelity));
must('existing exception taxonomy remains represented', ['PRICE_VARIANCE','OVER_CERTIFICATION','MISSING_PRICE_SOURCE','PENDING_CHANGE','NAKOPITELNIY_MISMATCH','DOCUMENT_MISSING','DOCUMENT_SUPERSEDED','FORMA3_RULE_UNRESOLVED'].every(code => types.includes(code)));
must('legacy BL→RS proportional and direct RS override oracle remains covered', /BL_RS_proportional/.test(R('frontend','src','lib','park-document-control','legacy-compat','legacy-compat.test.ts')) && /unless RS is explicitly stated/.test(R('frontend','src','lib','park-document-control','legacy-compat','fixtures.ts')));

console.log('\n── Migration order and release package ──');
const ids = migrations.map(name => name.slice(0, 14));
must('migration IDs are unique and lexicographically ordered', new Set(ids).size === ids.length && ids.every((id, index) => index === 0 || ids[index - 1] < id));
for (const id of ['20260902120000','20260906120000','20260907120000','20260908120000','20260910120000','20260911120000','20260912120000']) {
  const file = migrations.find(name => name.startsWith(id)); must(id + ': source, rollback and acceptance package exist', !!file && exists('supabase','migrations',file.replace('.sql','.rollback.sql')) && exists('supabase','migrations',file.replace('.sql','.acceptance.sql')));
}
must('file truth precedes document registry and replica-dependent layers', ids.indexOf('20260902120000') < ids.indexOf('20260906120000') && ids.indexOf('20260906120000') < ids.indexOf('20260907120000') && ids.indexOf('20260907120000') < ids.indexOf('20260908120000'));
must('F2 baseline precedes change control and Forma-3, with an explicit forward hotfix', ids.indexOf('20260910120000') < ids.indexOf('20260911120000') && ids.indexOf('20260911120000') < ids.indexOf('20260912120000') && migrations.some(name => /smeta_ozgarish_royxat_fix/.test(name)));

console.log('\n── Read-only deployment smoke harness ──');
const smoke = R('frontend','scripts','release-smoke.mjs');
must('smoke harness uses environment-only base URL and optional external session', /RELEASE_SMOKE_BASE_URL/.test(smoke) && /RELEASE_SMOKE_COOKIE/.test(smoke) && !/Bearer\s+[A-Za-z0-9._-]{20,}|password|login\(/i.test(smoke));
must('smoke makes read-only route checks with deterministic PASS/FAIL output', /RELEASE_SMOKE_PASS/.test(smoke) && /RELEASE_SMOKE_FAIL/.test(smoke) && !/method:\s*['"]POST/.test(smoke) && /hujjat-nazorat/.test(smoke) && /hujjat-royxat/.test(smoke));

console.log('\n' + ok + ' checks passed');
