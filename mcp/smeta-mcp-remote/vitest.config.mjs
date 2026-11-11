import { createRequire } from 'node:module';
import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { ixtiyoriyYoli, nisbiyAbs, stubYoli } from '../smeta-mcp/stubs.mjs';

// ../smeta-mcp/vitest.config.mjs bilan bir xil stub'lar. Umumiy yadro (../smeta-mcp/src) import qiladigan paketlar shu paketning
// node_modules idan olinadi — Worker bundle'dagi bilan bir xil yagona nusxa (../smeta-mcp/node_modules o'rnatilmagan bo'lsa ham).
const req = createRequire(import.meta.url);
const pkgDir = (n) => path.dirname(req.resolve(`${n}/package.json`));
const stubPlagin = {
  name: 'smeta-stub',
  enforce: 'pre',
  resolveId(spec, importer) {
    if (spec.startsWith('@frontend-ixtiyoriy/')) return ixtiyoriyYoli(spec);
    const abs = nisbiyAbs(spec, importer);
    return abs ? stubYoli(abs) : null;
  },
};

export default defineConfig({
  plugins: [stubPlagin],
  resolve: {
    alias: [
      { find: /^zod$/, replacement: req.resolve('zod') },
      { find: /^pg$/, replacement: req.resolve('pg') },
      { find: /^fflate$/, replacement: req.resolve('fflate') },
      { find: /^xlsx$/, replacement: path.join(pkgDir('xlsx'), 'xlsx.mjs') },
    ],
  },
  test: { include: ['test/**/*.test.ts'], environment: 'node', server: { deps: { inline: [/frontend[\\/]src/, /smeta-mcp[\\/]src/, /workers-oauth-provider/] } } },
});
