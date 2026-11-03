import { defineConfig } from 'vitest/config';

// Deliberate acceptance probes for open findings; excluded from ordinary *.test.* discovery.
// Run explicitly after the owner of the runtime module addresses the findings.
export default defineConfig({
  test: { environment: 'node', include: ['testlar/pto-joint-acceptance-20261025/*.audit.{ts,tsx}'] },
});
