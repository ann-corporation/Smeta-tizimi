/* T2-SMETA-IMPORT-DUPLICATE-GUARD-001 static contract tests.
 * Runtime SQL acceptance is intentionally separate and rollback-only. */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
let passed = 0; let failed = 0;
function tek(name, ok) {
  if (ok) { passed++; console.log('PASS', name); }
  else { failed++; console.error('FAIL', name); }
}

const api = read('frontend/functions/api/smeta-yukla.ts');
const sql = read('supabase/migrations/20261105120000_t2_smeta_import_dublikat_guard_v1.sql');
const rollback = read('supabase/migrations/20261105120000_t2_smeta_import_dublikat_guard_v1.rollback.sql');
const acceptance = read('supabase/migrations/20261105120000_t2_smeta_import_dublikat_guard_v1.acceptance.sql');
const anatomy = read('frontend/src/lib/smeta-anatomiya/akt-daraxt.test.ts');

tek('API source guard RPC is called before one-file import',
  api.includes("'t2_smeta_import_source_guard_v1'") &&
  api.indexOf('importManbaGuard') < api.indexOf("'t2_smeta_import_bulk_v1'"));
tek('package import passes all LRV document IDs to guard',
  api.includes('body.manbalar') && api.includes('sourceDocumentIds') && api.includes('p_source_document_ids'));
tek('guard returns explicit duplicate source code', sql.includes("'SOURCE_DOCUMENT_ALREADY_IMPORTED'"));
tek('empty object and populated object are distinct guard outcomes',
  sql.includes("'IMPORT_ALLOWED'") && sql.includes("'SMETA_ALREADY_EXISTS'"));
tek('server-side advisory lock wraps all import start/final paths',
  sql.includes('t2_smeta_import_object_lock_v1') &&
  (sql.match(/t2_smeta_import_object_lock_v1/g) || []).length >= 7);
tek('rollback restores old RPC names without deleting qator data',
  rollback.includes('rename to t2_smeta_import_v1') === false &&
  rollback.includes('drop index if exists public.t2_qator_object_source_document_idx') &&
  !rollback.includes('delete from public.t2_qator'));
tek('dry-run exposes keep candidate and never deletes',
  acceptance.includes('keep_candidate_id') && acceptance.includes('rollback;') && !acceptance.includes('delete from public.t2_qator'));
tek('existing anatomy contract excludes resource statement from work tree',
  anatomy.includes('vedomost ish emas') && anatomy.includes('ВЕДОМОСТЬ РЕСУРСОВ'));

console.log(`RESULT ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
