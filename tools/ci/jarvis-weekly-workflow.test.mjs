import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const source = readFileSync(new URL('../../.github/workflows/bilim-kuzatuv.yml', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const marker = '        run: |\n'; assert.ok(source.includes(marker));
const script = source.slice(source.indexOf(marker) + marker.length).replace(/^          /gm, '');
const root = resolve(tmpdir()); const dir = mkdtempSync(join(root, 'jarvis-weekly-workflow-'));
const prefix = `date() { printf '1'; }
curl() {
  while [ "$#" -gt 0 ]; do
    if [ "$1" = "--data" ]; then shift; printf '%s\\n' "$1" >> requests.txt; fi
    shift
  done
  printf '{"ok":true,"jarvis_hafta":{"ok":%s}}' "$TEST_WEEKLY_OK" > resp.json
  printf '200'
}
`;
try {
  const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
  const run = ok => spawnSync(bash, ['-e', '-o', 'pipefail', '-c', prefix + script], {
    cwd: dir, encoding: 'utf8', timeout: 20000,
    env: { ...process.env, KUZATUV_KALIT: 'synthetic-not-a-secret', PROD_URL: 'https://synthetic.invalid', TEST_WEEKLY_OK: String(ok) },
  });
  const good = run(true); assert.equal(good.status, 0, good.error?.message ?? good.stderr);
  const requests = readFileSync(join(dir, 'requests.txt'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(requests.length, 2); assert.equal(requests[0].amal, 'bilim_yigish');
  assert.equal(requests[1].amal, 'rivojlanish_tahlil');
  assert.match(requests[1].operation_id, /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  const bad = run(false); assert.ok(bad.status !== 0, 'legacy HTTP 200 must not hide weekly failure');
  assert.match(bad.stderr, /legacy success is insufficient/);
  console.log('JARVIS_WEEKLY_WORKFLOW_NESTED_STATUS_AND_OPERATION_ID_PASS');
} finally {
  assert.equal(dirname(dir), root); assert.ok(basename(dir).startsWith('jarvis-weekly-workflow-'));
  rmSync(dir, { recursive: true, force: true });
}
