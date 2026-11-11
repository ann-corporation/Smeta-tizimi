const fs = require('node:fs'); const path = require('node:path'); const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'); const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const validate = read('src/lib/park-closeout/validate.ts'); const types = read('src/lib/park-closeout/types.ts');
assert.match(types, /FORMA3_RULE_UNRESOLVED|forma3_unresolved/);
assert.match(validate, /PREVIOUS_PLUS_CURRENT_QUANTITY/); assert.match(validate, /PREVIOUS_PLUS_CURRENT_VALUE/);
assert.match(validate, /PRICE_SOURCE_SEPARATION/); assert.match(validate, /APPROVED_CHANGE_INCLUDED_ONCE/);
assert.match(validate, /JSON\.stringify/); assert.doesNotMatch(validate, /api\/gas|DriveApp|SpreadsheetApp|fetch\(/);
console.log('PARK closeout guards: 7 checks passed');
