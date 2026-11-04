const assert = require('node:assert/strict');
const { mkdtemp, readFile, rm, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { test } = require('node:test');

test('requires release fields and emits only validated public metadata', async t => {
  const { generateDesktopRelease } = await import('../scripts/generate-desktop-release.mjs');
  const dir = await mkdtemp(join(tmpdir(), 'desktop-release-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const input = join(dir, 'installer-manifest.json');
  const output = join(dir, 'desktop-release.json');
  const base = {
    file: 'Example App_9.8.7_x64-setup.exe', bytes: 1234, sha256: 'ab'.repeat(32),
    signerThumbprint: null, signature: 'NotSigned',
  };
  await writeFile(input, JSON.stringify(base));
  await assert.rejects(generateDesktopRelease(input, output), /Invalid installer manifest/);
  await assert.rejects(readFile(output), { code: 'ENOENT' });

  const release = { ...base, version: '9.8.7', arch: 'x64', generatedAtUtc: '2026-01-02T10:00:00.1234567Z' };
  await writeFile(input, '\uFEFF' + JSON.stringify({ ...release, downloadUrl: 'https://example.invalid' }));
  await generateDesktopRelease(input, output);
  assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), release);
  await assert.rejects(generateDesktopRelease(input, output), { code: 'EEXIST' });
});
