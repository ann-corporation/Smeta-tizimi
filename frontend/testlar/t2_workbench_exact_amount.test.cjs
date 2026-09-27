const fs = require('fs');
const assert = require('assert');
const path = require('path');
const root = path.resolve(__dirname, '..', '..');

const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261104100000_t2_workbench_certified_amount_v1.sql'), 'utf8');
const route = fs.readFileSync(path.join(root, 'frontend/functions/api/hujjat-nazorat.ts'), 'utf8');
const rollback = fs.readFileSync(path.join(root, 'supabase/migrations/20261104100000_t2_workbench_certified_amount_v1.rollback.sql'), 'utf8');

assert(migration.includes('t2_workbench_exact_v1'));
assert(migration.includes("'certifiedAmount', aq.certified_amount"));
assert(migration.includes("coalesce(aq.certified_quantity, aq.hajm)"));
assert(!migration.includes('coalesce(aq.certified_amount'));
assert(route.includes("'t2_workbench_exact_v1'"));
assert(rollback.includes('drop function if exists public.t2_workbench_exact_v1'));
console.log('T2_WORKBENCH_EXACT_AMOUNT_STATIC_PASS');
