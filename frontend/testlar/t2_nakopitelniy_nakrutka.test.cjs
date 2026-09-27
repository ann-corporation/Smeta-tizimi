/* NAKOPITELNIY markup regression guard.
 *
 * The compatibility view is consumed by t2_nakopitelniy_v2, but it must use
 * the canonical coefficient registry.  This is intentionally a source guard;
 * runtime SQL acceptance belongs in a disposable/preview database.
 */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..', '..');
const read = (name) => fs.readFileSync(path.join(root, ...name.split('/')), 'utf8');
const migration = read('supabase/migrations/20261102120000_t2_nakopitelniy_canonical_nakrutka_v1.sql');
const rollback = read('supabase/migrations/20261102120000_t2_nakopitelniy_canonical_nakrutka_v1.rollback.sql');
const acceptance = read('supabase/migrations/20261102120000_t2_nakopitelniy_canonical_nakrutka_v1.acceptance.sql');
const nakop = read('supabase/migrations/20261101090000_t2_nakopitelniy_v2_sahifa_barg_jami.sql');

assert.match(migration, /create or replace view public\.t2_obyekt_nakrutka/);
assert.match(migration, /t2_nakrutka_default_v1\(\)/);
assert.match(migration, /t2_nakrutka_koef/);
assert.match(migration, /t2_nakrutka_hisobla_v1/);
assert.match(migration, /s\.holat <> 'bekor'/);
assert.doesNotMatch(migration, /from public\.t2_nakrutka n/);
assert.match(rollback, /t2_nakrutka_hisob\(/);
assert.match(acceptance, /NAKRUTKA_CANONICAL_VIEW_MISSING/);
assert.match(nakop, /from public\.t2_obyekt_nakrutka n/);

console.log('t2_nakopitelniy_nakrutka: PASS (canonical source guard)');
