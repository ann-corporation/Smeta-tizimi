import { defineConfig } from 'vitest/config';

// Run only on PR143/144 candidate worktree, where FaktQamrov exists.
export default defineConfig({
  test: { environment: 'jsdom', include: ['testlar/pto-joint-acceptance-20261025/*.candidate.tsx'] },
});
