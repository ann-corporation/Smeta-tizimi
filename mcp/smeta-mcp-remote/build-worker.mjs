// 1-bosqich: Worker manbasini (umumiy tool yadrosi mcp/smeta-mcp/src + frontend sof mantig'i bilan) bitta ESM ga yig'adi.
// Brauzer modullari lokal server bilan AYNAN bir xil stub qilinadi (../smeta-mcp/stubs.mjs). npm paketlari tashqi qoladi —
// 2-bosqichda wrangler ularni nodejs_compat bilan o'zi bundle qiladi (pg, zod, MCP SDK, oauth-provider).
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ixtiyoriyYoli, nisbiyAbs, stubYoli } from '../smeta-mcp/stubs.mjs';

const BU = path.dirname(fileURLToPath(import.meta.url));

const stubPlagin = {
  name: 'smeta-stub',
  setup(b) {
    b.onResolve({ filter: /^@frontend-ixtiyoriy\// }, (a) => ({ path: ixtiyoriyYoli(a.path) }));
    b.onResolve({ filter: /^\.\.?\// }, (a) => {
      const abs = nisbiyAbs(a.path, a.importer);
      const s = abs && stubYoli(abs);
      return s ? { path: s } : undefined;
    });
  },
};

await build({
  entryPoints: [path.join(BU, 'src', 'worker.ts')],
  outfile: path.join(BU, 'dist', 'worker.mjs'),
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  mainFields: ['module', 'main'],
  conditions: ['workerd', 'worker', 'import'],
  packages: 'external',
  external: ['node:*', 'cloudflare:*'],
  plugins: [stubPlagin],
  sourcemap: true,
  logLevel: 'warning',
});
