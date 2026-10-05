// Bundle a TypeScript maintenance script with rolldown (already a Vite dependency) and run it.
// Usage: node scripts/catalog-extraction/run-ts.mjs <script.ts> [...args]
import { rolldown } from 'rolldown';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [entry, ...args] = process.argv.slice(2);
if (!entry) throw new Error('usage: run-ts.mjs <script.ts> [...args]');
const dir = mkdtempSync(join(tmpdir(), 'run-ts-'));
const file = join(dir, 'script.mjs');
try {
  const bundle = await rolldown({ input: resolve(entry), platform: 'node', external: [/^node:/] });
  await bundle.write({ file, format: 'esm' });
  process.argv = [process.argv[0], file, ...args];
  await import(pathToFileURL(file).href);
} finally { rmSync(dir, { recursive: true, force: true }); }
