const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const f3 = read('src/lib/forma3-export.ts');
const nakop = read('src/admin/sahifalar/NakopitelniyVedomost.tsx');
const lineage = read('src/lib/pto-document-lineage/index.ts');
const ledgerMigration = fs.readFileSync(path.resolve(root, '..', 'supabase/migrations/20261102110000_t2_nakopitelniy_ledger_semantics_v1.sql'), 'utf8');

assert.match(lineage, /export function validateF3Lineage/);
assert.match(lineage, /F3_SOURCE_SCOPE_MISMATCH/);
assert.match(lineage, /F3_SOURCE_NOT_APPROVED/);
assert.match(f3, /assertF3Lineage\(o\.lineage\)/);
assert.match(nakop, /sbT2ShartnomaBogOl/);
assert.match(nakop, /contractProjectId:\s*shartnoma\.loyiha_id/);
assert.match(nakop, /lineageRequired: true/);
assert.match(nakop, /Tasdiqlangan F2 manbasining akt ID si/);
assert.match(nakop, /Tasdiqlangan F2 manbasining exact summasi/);
assert.doesNotMatch(nakop, /akt_id\s*\?\?\s*['"]akt/);
assert.match(nakop, /akt_id/);
assert.doesNotMatch(nakop, /lineageRequired:\s*false/);
assert.match(ledgerMigration, /t2_nakopitelniy_ledger_v1/);
assert.match(ledgerMigration, /smeta_qoldiq_hajm/);
assert.match(ledgerMigration, /contract_qoldiq_summa/);
assert.match(ledgerMigration, /t2_nakopitelniy_v2/);

console.log('t2_pto_document_lineage: PASS');
