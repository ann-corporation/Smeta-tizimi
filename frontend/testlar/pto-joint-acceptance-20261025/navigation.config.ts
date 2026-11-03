import { defineConfig } from 'vitest/config';

// Run on the PR141/142 navigation stack, not on the separate Fakt candidate.
export default defineConfig({
  test: { environment: 'jsdom', include: ['testlar/pto-joint-acceptance-20261025/nav-*.candidate.tsx'] },
});
