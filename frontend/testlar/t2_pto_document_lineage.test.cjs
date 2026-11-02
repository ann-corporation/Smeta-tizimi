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
/* da1611be (T2-PTO-LIFECYCLE-REPAIR-001, ops/handoff): shartnoma rekvizitlari yetishmasa F3 bo'sh rekvizit bilan
   davom etadi (diqqat bilan), lekin scope aniqlansa lineage MAJBURIY; noto'g'ri tenant/obyekt/shartnoma bog'lanishi
   baribir bloklanadi va F3 faqat tasdiqlangan F2 manbasidan olinadi. */
assert.match(nakop, /lineageRequired: Boolean\(lineage\)/);
assert.match(nakop, /PtoF3LineageInput \| undefined = scope && f2Oylik\.length/);
assert.match(nakop, /obyektKompaniyaId !== companyId\)\s*\{\s*setXato\([^)]*\);\s*return null;/);
assert.match(nakop, /if \(!hierarchy\.ok\) \{ setXato\([^)]*\); return null; \}/);
assert.match(nakop, /f3CertifiedSources\(taf\.qatorlar, companyId, Number\(objectId\)/);
/* da1611be: akt ID va exact (certified) summa tekshiruvi sahifadan `f3CertifiedSources` ichiga ko'chdi —
   endi generated `summa` ga fallback yo'q, yetishmasa F3 yasalmaydi (throw). */
const f3src = read('src/lib/pto-document-lineage/f3-sources.ts');
assert.match(f3src, /throw new Error\('F3_SOURCE_ID_REQUIRED'\)/);
assert.match(f3src, /throw new Error\('MISSING_CERTIFIED_AMOUNT'\)/);
assert.match(f3src, /throw new Error\('F3_SOURCE_SCOPE_MISMATCH'\)/);
assert.match(f3src, /akt_holat !== 'tasdiqlangan'\) continue/);
assert.doesNotMatch(nakop, /akt_id\s*\?\?\s*['"]akt/);
assert.match(nakop, /akt_id/);
assert.doesNotMatch(nakop, /lineageRequired:\s*false/);
assert.match(ledgerMigration, /t2_nakopitelniy_ledger_v1/);
assert.match(ledgerMigration, /smeta_qoldiq_hajm/);
assert.match(ledgerMigration, /contract_qoldiq_summa/);
assert.match(ledgerMigration, /t2_nakopitelniy_v2/);

console.log('t2_pto_document_lineage: PASS');
