const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const f3 = read('src/lib/forma3-export.ts');
const nakop = read('src/admin/sahifalar/NakopitelniyVedomost.tsx');
const lineage = read('src/lib/pto-document-lineage/index.ts');

assert.match(lineage, /export function validateF3Lineage/);
assert.match(lineage, /F3_SOURCE_SCOPE_MISMATCH/);
assert.match(lineage, /F3_SOURCE_NOT_APPROVED/);
assert.match(f3, /assertF3Lineage\(o\.lineage\)/);
assert.match(nakop, /sbT2ShartnomaBogOl/);
assert.match(nakop, /contractProjectId:\s*shartnoma\.loyiha_id/);
assert.match(nakop, /lineageRequired: true/);
assert.match(nakop, /akt_id/);
assert.doesNotMatch(nakop, /lineageRequired:\s*false/);

console.log('t2_pto_document_lineage: PASS');
