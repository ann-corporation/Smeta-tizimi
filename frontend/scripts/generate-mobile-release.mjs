import { readFile, writeFile } from 'node:fs/promises';
import { parseAndroidRelease, parseIosRelease, parseMacRelease } from '../src/components/public-entry/mobile-release.ts';

// Node 24. Mobile release manifest (public/mobile-release.json). Windows stays in desktop-release.json
// (scripts/generate-desktop-release.mjs) and is not touched here.
//
//   node scripts/generate-mobile-release.mjs android <android-manifest.json>
//   node scripts/generate-mobile-release.mjs macos <macos-manifest.json>   (version, generatedAtUtc, file *.dmg, bytes, sha256, signed, notarized)
//   node scripts/generate-mobile-release.mjs ios <pwa|testflight|appstore> [https://testflight.apple.com/... | https://apps.apple.com/...]
//
// android-manifest.json: { version, generatedAtUtc, file (*.apk), bytes, sha256, signed (boolean), minSdk }.
// Before deploying the JSON, stage the APK at /android/<version>/<sha256>/<file> on the site origin
// (same layout as /windows/...), serve it directly without redirects and compare size and SHA-256.
// Each run updates only its own platform and keeps the other one. Validation is strict (same rules as the page);
// an invalid input aborts without writing. Omit the JSON entirely to show "Tez orada" cards.
export async function generateMobileRelease(platform, input, outputPath) {
  let current = {};
  try {
    current = JSON.parse((await readFile(outputPath, 'utf8')).replace(/^﻿/, ''));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const next = {};
  if (platform === 'android') {
    const release = parseAndroidRelease(JSON.parse((await readFile(input, 'utf8')).replace(/^﻿/, '')));
    if (!release) throw new Error('Invalid android manifest');
    next.android = release;
    if (current.ios) next.ios = current.ios;
    if (current.macos) next.macos = current.macos;
  } else if (platform === 'macos') {
    const release = parseMacRelease(JSON.parse((await readFile(input, 'utf8')).replace(/^﻿/, '')));
    if (!release) throw new Error('Invalid macos manifest');
    next.macos = release;
    if (current.android) next.android = current.android;
    if (current.ios) next.ios = current.ios;
  } else if (platform === 'ios') {
    const release = parseIosRelease(input);
    if (!release) throw new Error('Invalid ios release (mode pwa|testflight|appstore; store modes need an https Apple URL)');
    next.ios = release.url ? { mode: release.mode, url: release.url } : { mode: release.mode };
    if (current.android) next.android = current.android;
    if (current.macos) next.macos = current.macos;
  } else {
    throw new Error('Platform must be android, macos or ios');
  }
  await writeFile(outputPath, JSON.stringify(next, null, 2) + '\n');
  return next;
}

if (import.meta.main) {
  const [platform, a, b, ...extra] = process.argv.slice(2);
  const out = new URL('../public/mobile-release.json', import.meta.url);
  if ((platform === 'android' || platform === 'macos') && a && !b && !extra.length) await generateMobileRelease(platform, a, out);
  else if (platform === 'ios' && a && !extra.length) await generateMobileRelease('ios', { mode: a, url: b }, out);
  else throw new Error('Usage: android <manifest.json> | ios <mode> [url]');
}
