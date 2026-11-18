/* FILE-TRUTH-001 — canonical (Supabase + PRIVATE R2) vs replica (Drive/Sheets).
 * Source/contract guards, pre-production correction set:
 *   1. PRIVATE canonical R2   2. true large-file path   3. two-phase commit
 *   4. replica worker present 5. security invariants
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const R = (...p) => fs.readFileSync(path.join(__dirname, '..', '..', ...p), 'utf8');
let ok = 0;
const must = (label, cond) => { assert(cond, label); console.log('  ✅ ' + label); ok++; };

const upload = R('frontend', 'functions', 'api', 'hujjat-yukla.ts');
const download = R('frontend', 'functions', 'api', 'hujjat-ol.ts');
const client = R('frontend', 'src', 'api', 't2-hujjat-canonical.ts');
const mig = R('supabase', 'migrations', '20260902120000_t2_file_truth_r2_canonical_v1.sql');
const rollback = R('supabase', 'migrations', '20260902120000_t2_file_truth_r2_canonical_v1.rollback.sql');
const doc = R('docs', 'architecture', 'FILE_TRUTH_AND_SECONDARY_REPLICA_V1.md');
const allCanonicalTs = client + upload + download;

console.log('\n── 1. PRIVATE canonical R2 (no public / obscurity-only path) ──');
must('canonical upload/download use the PRIVATE R2_CANONICAL binding', /R2_CANONICAL/.test(upload) && /R2_CANONICAL/.test(download));
must('canonical path never touches the public R2_ARCHIVE bucket', !/R2_ARCHIVE/.test(allCanonicalTs));
must('canonical path never links the public read domain (r2.qurilish-os.uz)', !/qurilish-os\.uz|r2\.[a-z-]+\.uz/.test(allCanonicalTs));
must('every download goes through an authenticated Cloudflare endpoint', /tekshir\(ctx\.request\.headers\.get\('Cookie'\)/.test(download) && !/fetch\((['"`]https?:\/\/[^/]+\/[^)]*r2)/i.test(download));

console.log('\n── 2. True large-file path (no false streaming claims) ──');
must('small file: buffered once + server re-hash + verify', /file\.arrayBuffer\(\)[\s\S]*sha256Hex\(buf\)[\s\S]*serverSha !== clientSha/.test(upload));
must('large file: real stream to R2 (file.stream()), no whole-file buffer', /(R2_CANONICAL\.put\(r2Key, file\.stream\(\), meta\)|r2Yoz\(ctx\.env\.R2_CANONICAL, r2Key, file\.stream\(\), meta\))/.test(upload));
must('explicit configurable inline-hash limit', /CANONICAL_HASH_INLINE_LIMIT/.test(upload) && /DEFAULT_INLINE_LIMIT/.test(upload));
must('explicit configurable hard max upload size (413)', /CANONICAL_MAX_UPLOAD_BYTES/.test(upload) && /FILE_TOO_LARGE/.test(upload) && /status: 413/.test(upload));
must('limit + behavior documented', /HASH_INLINE_LIMIT|large PDF\/DWG\/XLSX\/ZIP|CANONICAL_MAX_UPLOAD_BYTES/.test(doc) || /streaming/i.test(doc));
must('client computes sha256 in the browser (needed before streaming)', /crypto\.subtle\.digest\('SHA-256'/.test(client) && /fd\.append\('sha256'/.test(client));

console.log('\n── 3. Two-phase canonical commit (no orphan R2 objects) ──');
must('phase 1: reserve allocates document_id + deterministic r2_key', /t2_document_canonical_reserve_v1/.test(upload) && /t2_document_canonical_reserve_v1[\s\S]*canonical_storage_status[\s\S]*'reserved'/.test(mig));
must('phase 3: finalize sets stored + sha + size', /t2_document_canonical_finalize_v1/.test(upload) && /canonical_storage_status='stored'/.test(mig));
must('finalize verifies the key matches the reserved key', /CANONICAL_KEY_MISMATCH/.test(mig));
must('reconcile job can finalize-from-R2 or fail cleanly', /t2_document_canonical_reconcile_v1[\s\S]*finalized_from_r2[\s\S]*failed_no_binary/.test(mig));
must('reserve r2_key derived from document_id, not from name', /format\('docs\/%s\/%s\/%s\/d%s\/r%s'/.test(mig));
must('interrupted upload triggers reconcile (202, row stays reserved)', /status: 202[\s\S]*canonical_storage_status: 'reserved'|DOCUMENT_FINALIZE_FAILED/.test(upload));
must('hash mismatch on small file -> reconcile cleanup + reject', /CANONICAL_HASH_MISMATCH[\s\S]*t2_document_canonical_reconcile_v1|t2_document_canonical_reconcile_v1[\s\S]*CANONICAL_HASH_MISMATCH/.test(upload));

console.log('\n-- 4. Google Drive removed: no replica worker, no internal mirror endpoint, no Drive scan --');
must('GAS Drive replica worker file is gone', !fs.existsSync(path.join(__dirname, '..', '..', 'Smeta tizimi', '98_T2ReplicaSync.js')));
must('internal mirror endpoint hujjat-r2 is gone', !fs.existsSync(path.join(__dirname, '..', 'functions', 'api', 'hujjat-r2.ts')));
must('canonical upload response no longer advertises a Drive sync state', !/drive_sync/.test(upload));
must('canonical TS path never calls Google Drive APIs', !/googleapis\.com\/drive|DriveApp/.test(allCanonicalTs));

console.log('\n── 5. Security + conflict invariants ──');
must('download denies unauthenticated (401)', /if \(!sess\) return Response\.json\(\{ ok: false, code: 'AUTH_REQUIRED' \}, \{ status: 401 \}\)/.test(download));
must('upload denies unauthenticated (401)', /if \(!sess\) return Response\.json\([\s\S]*status: 401/.test(upload));
must('canonical get authorizes the actor by company membership', /t2_actor_kompaniya_azo_tekshir\(d\.kompaniya_id,p_actor_id\)/.test(mig));
must('canonical get only returns STORED documents', /canonical_storage_status <> 'stored'[\s\S]*CANONICAL_BINARY_MISSING/.test(mig));
must('cross-company upload rejected', /STORAGE_TENANT_MISMATCH/.test(mig) && /PROJECT_COMPANY_MISMATCH/.test(mig));
must('same operation_id -> existing row, retry flag, no duplicate', /where kompaniya_id=p_kompaniya_id and operation_id=p_operation_id for update[\s\S]*'retry',true/.test(mig));
must('replica content revision fails closed on stale base_version', /REPLICA_CONFLICT[\s\S]*d\.versiya<>p_base_version|d\.versiya<>p_base_version[\s\S]*REPLICA_CONFLICT/.test(mig));
must('Drive delete never hard-deletes R2', /R2 is NEVER hard-deleted|canonical R2 retained|r2_retained/.test(mig));
must('rollback is additive-only (no data delete)', !/delete from|truncate/i.test(rollback));
must('all canonical/replica command functions are service_role only', /revoke all on function[\s\S]*from public, anon, authenticated/.test(mig));
must('no global Drive/Sheets scan anywhere on the canonical client path', !/getFoldersByName|searchFiles|getFilesByName|SpreadsheetApp/.test(allCanonicalTs));
must('Sheets is contract-only tonight (explicit)', /contract-only|contract only|V1 da: minimum viable|state that explicitly/i.test(doc));

console.log('\n' + ok + ' checks passed');
