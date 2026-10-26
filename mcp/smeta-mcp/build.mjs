// dist/index.js - bitta ESM fayl (frontend sof mantig'i ichida). `node build.mjs`.
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ixtiyoriyYoli, nisbiyAbs, stubYoli } from './stubs.mjs';

const BU = path.dirname(fileURLToPath(import.meta.url));

export const stubPlagin = {
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

const r = await build({
  entryPoints: [path.join(BU, 'src', 'index.ts')],
  outfile: path.join(BU, 'dist', 'index.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  sourcemap: true,
  // Frontend fayllari import qiladigan paketlar (fflate, xlsx) MCP'ning o'z node_modules'idan topiladi.
  nodePaths: [path.join(BU, 'node_modules')],
  packages: 'bundle',
  // Faqat dinamik import qilinadigan (MCP yo'lida chaqirilmaydigan) eksport kutubxonalari.
  external: ['pg-native', 'xlsx-js-style', 'jspdf', 'jspdf-autotable', 'exceljs'],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  plugins: [stubPlagin],
  logLevel: 'warning',
  metafile: process.argv.includes('--meta'),
});
if (r.metafile) for (const k of Object.keys(r.metafile.inputs)) console.log(k);
