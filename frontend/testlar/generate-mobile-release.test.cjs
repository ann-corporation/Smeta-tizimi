const assert = require('node:assert/strict');
const { mkdtemp, readFile, rm, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { test } = require('node:test');

test('validates per platform, merges platforms and never writes invalid input', async t => {
  const { generateMobileRelease } = await import('../scripts/generate-mobile-release.mjs');
  const dir = await mkdtemp(join(tmpdir(), 'mobile-release-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const input = join(dir, 'android-manifest.json');
  const output = join(dir, 'mobile-release.json');
  const android = {
    version: '1.2.3', generatedAtUtc: '2026-01-02T10:00:00Z', file: 'app-1.2.3-debug.apk',
    bytes: 5_000_000, sha256: 'cd'.repeat(32), signed: false, minSdk: 24,
  };

  await writeFile(input, JSON.stringify({ ...android, sha256: 'xyz' }));
  await assert.rejects(generateMobileRelease('android', input, output), /Invalid android manifest/);
  await assert.rejects(readFile(output), { code: 'ENOENT' });

  await writeFile(input, '﻿' + JSON.stringify({ ...android, downloadUrl: 'https://example.invalid/x.apk' }));
  await generateMobileRelease('android', input, output);
  assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), { android });

  await assert.rejects(generateMobileRelease('ios', { mode: 'testflight', url: 'http://testflight.apple.com/join/x' }, output), /Invalid ios/);
  await assert.rejects(generateMobileRelease('ios', { mode: 'appstore', url: 'https://example.invalid/app' }, output), /Invalid ios/);
  await generateMobileRelease('ios', { mode: 'testflight', url: 'https://testflight.apple.com/join/abc' }, output);
  assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), { android, ios: { mode: 'testflight', url: 'https://testflight.apple.com/join/abc' } });

  await generateMobileRelease('ios', { mode: 'pwa' }, output);
  assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), { android, ios: { mode: 'pwa' } });
  const macFile = join(dir, 'mac.json');
  const mac = { version: '1.2.3', generatedAtUtc: '2026-01-02T10:00:00Z', file: 'Smeta_1.2.3.dmg', bytes: 9_000_000, sha256: 'ef'.repeat(32), signed: true, notarized: false };
  await writeFile(macFile, JSON.stringify({ ...mac, file: 'a.pkg' }));
  await assert.rejects(generateMobileRelease('macos', macFile, output), /Invalid macos manifest/);
  await writeFile(macFile, JSON.stringify(mac));
  await generateMobileRelease('macos', macFile, output);
  assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), { macos: mac, android, ios: { mode: 'pwa' } });
  await generateMobileRelease('ios', { mode: 'pwa' }, output);
  assert.deepEqual(JSON.parse(await readFile(output, 'utf8')).macos, mac);
  await assert.rejects(generateMobileRelease('windows', input, output), /Platform must be/);
});
