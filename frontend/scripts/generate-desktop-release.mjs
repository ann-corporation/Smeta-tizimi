import { readFile, writeFile } from 'node:fs/promises';
import { parseDesktopRelease } from '../src/components/public-entry/desktop-release.ts';

// Node 24. Usage: node frontend/scripts/generate-desktop-release.mjs <installer-manifest.json>
// M1 fields: version (major.minor.patch), arch (x64), generatedAtUtc (ISO UTC ending in Z),
// file (installer basename), bytes, sha256, signature and signerThumbprint.
// NotSigned pairs with null. Valid pairs with a 40-digit hex signer thumbprint.
// Before deploying the generated JSON, stage the installer and INSTALL_RU.md at
// /windows/<version>/<sha256>/ on the site origin, matching the M1 R2 key prefix.
// Serve both directly on that origin, without redirects.
// Publish only after checking the hosted installer's size and hash against the manifest.
// Generate in a clean staging tree. The output is a deployment artifact and
// generation refuses to overwrite it. Omit the JSON to hide the intro block.
export async function generateDesktopRelease(manifestPath, outputPath) {
  const source = await readFile(manifestPath, 'utf8');
  const release = parseDesktopRelease(JSON.parse(source.replace(/^\uFEFF/, '')));
  if (!release) throw new Error('Invalid installer manifest');

  await writeFile(outputPath, JSON.stringify(release, null, 2) + '\n', { flag: 'wx' });
}

if (import.meta.main) {
  const [manifestPath, ...extra] = process.argv.slice(2);
  if (!manifestPath || extra.length) throw new Error('Expected exactly one installer manifest path');
  await generateDesktopRelease(manifestPath, new URL('../public/desktop-release.json', import.meta.url));
}
