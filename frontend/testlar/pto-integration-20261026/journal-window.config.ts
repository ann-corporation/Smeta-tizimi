import { defineConfig } from 'vitest/config';
import base from '../../vitest.config';

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['testlar/pto-integration-20261026/journal-window.test.tsx'],
  },
});

