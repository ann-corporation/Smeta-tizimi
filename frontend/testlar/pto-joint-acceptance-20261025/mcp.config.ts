import { defineConfig } from 'vitest/config';

// Run on a source snapshot containing mcp/smeta-mcp, with that package's dependencies present.
export default defineConfig({
  test: { environment: 'node', include: ['testlar/pto-joint-acceptance-20261025/mcp-*.candidate.ts'] },
});
