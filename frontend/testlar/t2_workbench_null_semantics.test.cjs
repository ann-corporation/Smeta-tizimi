/*
 * Regression guard for canonical NULL baseline facts.
 * A missing estimate quantity/price is unknown, not a zero.  This test is
 * intentionally source-level: applying migrations is a release operation and
 * is not performed by the local reliability lane.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.join(__dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const migration = read('supabase', 'migrations', '20261011120000_t2_workbench_preserve_null_v1.sql');
const rollback = read('supabase', 'migrations', '20261011120000_t2_workbench_preserve_null_v1.rollback.sql');
const acceptance = read('supabase', 'migrations', '20261011120000_t2_workbench_preserve_null_v1.acceptance.sql');
const adapter = read('frontend', 'src', 'api', 't2-document-control.ts');
const calculation = read('frontend', 'src', 'lib', 'construction-document-control', 'calculation.ts');
const fail = (message) => { throw new assert.AssertionError({ message }); };
let checks = 0;
const must = (message, condition) => { if (!condition) fail(message); checks++; };
const normalized = migration.replace(/\s+/g, ' ');

must('forward migration exists and replaces the workbench function', /create or replace function public\.t2_workbench_v1/.test(migration));
must('baseline quantity is emitted directly, preserving SQL NULL', /'baselineQuantity', q\.hajm/.test(normalized));
must('baseline reference price is emitted directly, preserving SQL NULL', /'baselineReferencePrice', q\.narx/.test(normalized));
must('forward migration does not reintroduce coalesced baseline facts', !/'baselineQuantity', coalesce\(q\.hajm,0\)/.test(normalized) && !/'baselineReferencePrice', coalesce\(q\.narx,0\)/.test(normalized));
must('rollback restores a captured definition instead of dropping the API', /pg_get_functiondef|function_sql/.test(rollback) && !/drop function public\.t2_workbench_v1/.test(rollback));
must('acceptance has a real NULL fixture and PASS sentinel', /hajm is null or q\.narx is null/.test(acceptance) && /T2_WORKBENCH_NULL_SEMANTICS_ACCEPTANCE_PASS/.test(acceptance));
must('client adapter preserves nullable baseline facts', /nullableNumber/.test(adapter) && /baselineQuantity: nullableNumber\(l\.baselineQuantity\)/.test(adapter) && /baselineReferencePrice: nullableNumber\(l\.baselineReferencePrice\)/.test(adapter));
must('pure engine keeps unknown entitlement/value as null', /approvedEntitlementQuantity = line\.baselineQuantity === null \? null/.test(calculation) && /line\.baselineReferencePrice === null \? null/.test(calculation));
must('pure engine surfaces explicit missing baseline warnings', /MISSING_BASELINE_QUANTITY/.test(calculation) && /MISSING_BASELINE_PRICE/.test(calculation));
console.log(`✅ Workbench NULL semantics: ${checks} checks passed`);
