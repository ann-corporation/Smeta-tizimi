import { defineConfig } from 'vitest/config';
import { ixtiyoriyYoli, nisbiyAbs, stubYoli } from './stubs.mjs';

// build.mjs dagi esbuild plagini bilan bir xil almashtirishlar (testda ham frontend sof mantig'i Node'da).
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
  test: { include: ['test/**/*.test.ts'], environment: 'node', server: { deps: { inline: [/frontend[\\/]src/] } } },
});
